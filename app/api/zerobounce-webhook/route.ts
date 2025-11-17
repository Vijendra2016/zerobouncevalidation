import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email =
      body?.email ||
      body?.data?.email ||
      body?.profile?.email ||
      null;

    if (!email) {
      return NextResponse.json(
        { error: "Email not provided in webhook body" },
        { status: 400 }
      );
    }

    const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY!;
    const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY!;

    // 1️⃣ ZeroBounce validation
    const zbUrl = `https://api.zerobounce.net/v2/validate?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(
      email
    )}`;

    const zbResponse = await fetch(zbUrl);
    const zbData = await zbResponse.json();

    const status = zbData.status;
    const sub_status = zbData.sub_status;
    const suggestion = zbData.did_you_mean;
    const is_valid = status === "valid";

    // 2️⃣ Lookup Klaviyo Profile by Email
    const lookupUrl = `https://a.klaviyo.com/api/profiles?filter=equals(email,"${email}")`;

    const lookupRes = await fetch(lookupUrl, {
      headers: {
        Authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
        revision: "2023-02-22",
      },
    });

    const lookupJson = await lookupRes.json();

    if (!lookupJson.data || lookupJson.data.length === 0) {
      console.error("Profile not found:", email);
      return NextResponse.json(
        { error: "Profile not found in Klaviyo" },
        { status: 404 }
      );
    }

    const profileId = lookupJson.data[0].id;

    // 3️⃣ PATCH (update) the profile
    const updateRes = await fetch(
      `https://a.klaviyo.com/api/profiles/${profileId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
          "Content-Type": "application/json",
          revision: "2023-02-22",
        },
        body: JSON.stringify({
          data: {
            id: profileId,
            type: "profile",
            attributes: {
              properties: {
                zb_status: status,
                zb_sub_status: sub_status,
                zb_is_valid: is_valid,
                zb_suggestion: suggestion ?? null,
              },
            },
          },
        }),
      }
    );

    const updateJson = await updateRes.json();

    if (!updateRes.ok) {
      console.error("Klaviyo update failed:", updateJson);
      return NextResponse.json(
        { error: "Failed to update Klaviyo", details: updateJson },
        { status: 500 }
      );
    }

    console.log("Klaviyo update success:", updateJson);

    return NextResponse.json({
      email,
      status,
      sub_status,
      suggestion,
      is_valid,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: "Only POST allowed" }, { status: 405 });
}
