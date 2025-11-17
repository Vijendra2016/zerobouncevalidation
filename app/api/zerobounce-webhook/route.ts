import type { NextApiRequest, NextApiResponse } from "next";

// Types for ZeroBounce response
interface ZeroBounceResponse {
  address: string;
  status: string;
  sub_status: string;
  did_you_mean: string | null;
  processed_at: string;
}

// Klaviyo payload structure
interface KlaviyoProfileUpdate {
  data: {
    type: "profile";
    attributes: {
      email: string;
      properties: {
        zb_status: string;
        zb_sub_status: string;
        zb_is_valid: boolean;
        zb_suggestion: string | null;
      };
    };
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST allowed" });
  }

  const email = req.body?.data?.email as string | undefined;

  if (!email) {
    return res.status(400).json({ error: "Email not provided" });
  }

  const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY;
  const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY;

  if (!ZEROBOUNCE_API_KEY || !KLAVIYO_PRIVATE_KEY) {
    return res.status(500).json({
      error: "Missing ZEROBOUNCE_API_KEY or KLAVIYO_PRIVATE_KEY",
    });
  }

  try {
    // 1️⃣ ZeroBounce validation (fetch instead of axios)
    const zbUrl = `https://api.zerobounce.net/v2/validate?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(
      email
    )}`;

    const zbResponse = await fetch(zbUrl);
    const zbData: ZeroBounceResponse = await zbResponse.json();

    const status = zbData.status;
    const sub_status = zbData.sub_status;
    const suggestion = zbData.did_you_mean;
    const is_valid = status === "valid";

    // 2️⃣ Build Klaviyo payload
    const profileUpdate: KlaviyoProfileUpdate = {
      data: {
        type: "profile",
        attributes: {
          email,
          properties: {
            zb_status: status,
            zb_sub_status: sub_status,
            zb_is_valid: is_valid,
            zb_suggestion: suggestion,
          },
        },
      },
    };

    // 3️⃣ Send update to Klaviyo
    const klaviyoResponse = await fetch("https://a.klaviyo.com/api/profiles/", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
        "Content-Type": "application/json",
        revision: "2023-02-22",
      },
      body: JSON.stringify(profileUpdate),
    });

    if (!klaviyoResponse.ok) {
      const errorText = await klaviyoResponse.text();
      console.error("Klaviyo update failed:", errorText);
    }

    return res.status(200).json({
      email,
      status,
      sub_status,
      suggestion,
      is_valid,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
