import { randomBytes } from "node:crypto";

import { withTransaction } from "../db/pool.js";

export interface RegisteredVendorAccount {
  userId: string;
  organizationId: string;
  organizationName: string;
  vendorProfileId: string;
}

function organizationCode(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16)
    .replace(/-$/, "");

  // The suffix makes the code unique without a retry loop; two firms with the
  // same trading name are a realistic case, not an error.
  return `VND-${slug === "" ? "ORG" : slug}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

/**
 * Creates the organization, the user and the draft capability profile as one
 * unit. A half-created account would leave someone able to sign in with nowhere
 * to go, so all three succeed or none do.
 *
 * The caller must have confirmed the email address is free; the unique index on
 * `users.email` is the backstop, and a violation surfaces as a database error
 * rather than a silent overwrite.
 */
export async function registerVendorAccount(input: {
  organizationName: string;
  fullName: string;
  email: string;
  passwordHash: string;
  phone: string | null;
}): Promise<RegisteredVendorAccount> {
  return withTransaction(async (execute) => {
    const organization = await execute<{ id: string; name: string }>(
      `INSERT INTO organizations (code, name, kind)
       VALUES ($1, $2, 'VENDOR'::organization_kind)
       RETURNING id, name`,
      [organizationCode(input.organizationName), input.organizationName],
    );

    const organizationRow = organization.rows[0];
    if (organizationRow === undefined) {
      throw new Error("Failed to create the supplier organisation.");
    }

    const user = await execute<{ id: string }>(
      `INSERT INTO users (email, full_name, role, organization_id, password_hash, is_active)
       VALUES ($1, $2, 'VENDOR'::user_role, $3, $4, true)
       RETURNING id`,
      [input.email, input.fullName, organizationRow.id, input.passwordHash],
    );

    const userRow = user.rows[0];
    if (userRow === undefined) {
      throw new Error("Failed to create the supplier account.");
    }

    const profile = await execute<{ id: string }>(
      `INSERT INTO vendor_profiles
         (organization_id, created_by, legal_name, primary_contact, authorised_representative)
       VALUES ($1, $2, $3, $4::jsonb, $4::jsonb)
       RETURNING id`,
      [
        organizationRow.id,
        userRow.id,
        input.organizationName,
        JSON.stringify({
          name: input.fullName,
          email: input.email,
          ...(input.phone === null ? {} : { phone: input.phone }),
        }),
      ],
    );

    const profileRow = profile.rows[0];
    if (profileRow === undefined) {
      throw new Error("Failed to create the capability profile.");
    }

    await execute(
      `INSERT INTO vendor_notifications (vendor_profile_id, category, title, body, link_path)
       VALUES ($1, 'REGISTRATION', $2, $3, $4)`,
      [
        profileRow.id,
        "Supplier account created",
        "Your account is active. Complete your capability profile so the platform can match your " +
          "organisation to published procurement opportunities.",
        "/vendor/onboarding",
      ],
    );

    return {
      userId: userRow.id,
      organizationId: organizationRow.id,
      organizationName: organizationRow.name,
      vendorProfileId: profileRow.id,
    };
  });
}
