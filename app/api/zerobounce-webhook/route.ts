import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Support both formats:
    // Klaviyo Preview/Test:  { "email": "..." }
    // Klaviyo Flow Event:    { "data": { "email": "..." } }
    const email =
      body?.email ||
      body?.data?.email ||
      body?.profile?.email || // some flows send profile.email
      null;

    if (!email) {
      return NextResponse.json(
        { error: "Email not provided in webhook body" },
        { status: 400 }
      );
    }

    const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY!;
    const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY!;

    // 1️⃣ Call ZeroBounce
    const zbUrl = `https://api.zerobounce.net/v2/validate?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(
      email
    )}`;

    const zbResponse = await fetch(zbUrl);
    const zbData = await zbResponse.json();

    const status = zbData.status;
    const sub_status = zbData.sub_status;
    const suggestion = zbData.did_you_mean;
    const is_valid = status === "valid";

    // 2️⃣ Update Klaviyo profile
    await fetch("https://a.klaviyo.com/api/profiles/", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
        "Content-Type": "application/json",
        revision: "2023-02-22",
      },
      body: JSON.stringify({
        data: {
          type: "profile",
          attributes: {
            email,
            properties: {
              zb_status: status,
              zb_sub_status: sub_status,
              zb_is_valid: is_valid,
              zb_suggestion: suggestion ?? null,
            },
          },
        },
      }),
    });

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
