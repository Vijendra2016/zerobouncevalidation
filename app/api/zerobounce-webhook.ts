import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

// Types for ZeroBounce response
interface ZeroBounceResponse {
  address: string;
  status: string;
  sub_status: string;
  did_you_mean: string | null;
  free_email: boolean;
  mx_found: boolean;
  mx_record: string | null;
  smtp_provider: string | null;
  firstname: string | null;
  lastname: string | null;
  gender: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  zipcode: string | null;
  processed_at: string;
}

// Types for Klaviyo profile update
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

  try {
    const email = req.body?.data?.email as string | undefined;

    if (!email) {
      return res.status(400).json({ error: "Email not provided" });
    }

    const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY;
    const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY;

    if (!ZEROBOUNCE_API_KEY || !KLAVIYO_PRIVATE_KEY) {
      return res.status(500).json({
        error: "Missing environment variables: ZEROBOUNCE_API_KEY or KLAVIYO_PRIVATE_KEY",
      });
    }

    // 1️⃣ Validate email via ZeroBounce
    const zbResponse = await axios.get<ZeroBounceResponse>(
      "https://api.zerobounce.net/v2/validate",
      {
        params: {
          api_key: ZEROBOUNCE_API_KEY,
          email,
        },
      }
    );

    const result = zbResponse.data;

    const status = result.status;
    const sub_status = result.sub_status;
    const suggestion = result.did_you_mean;
    const is_valid = status === "valid";

    // 2️⃣ Build Klaviyo Profile payload
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

    // 3️⃣ Update Klaviyo Profile
    await axios.post("https://a.klaviyo.com/api/profiles/", profileUpdate, {
      headers: {
        Authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
        "Content-Type": "application/json",
        revision: "2023-02-22",
      },
    });

    return res.status(200).json({
      email,
      status,
      sub_status,
      suggestion,
      is_valid,
    });
  } catch (error: any) {
    console.error("Webhook error:", error.response?.data || error);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
