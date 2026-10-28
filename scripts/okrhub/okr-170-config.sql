-- OKR-170 configuration: Capsule pipeline stages, Deal types, GBP default. Re-runnable.
BEGIN;

INSERT INTO "crm_Opportunities_Sales_Stages" ("id", "__v", "name", "probability", "order")
SELECT gen_random_uuid(), 0, v.name, v.p, v.o
FROM (VALUES
  ('Qualification', 10, 1),
  ('Literature Sent', 20, 2),
  ('Initial Pitch', 30, 3),
  ('Follow on Pitch', 50, 4),
  ('Formal Proposal Issued', 71, 5),
  ('Negotiation/Review', 85, 6),
  ('Won', 100, 7)
) AS v(name, p, o)
WHERE NOT EXISTS (SELECT 1 FROM "crm_Opportunities_Sales_Stages" s WHERE s."name" = v.name);

INSERT INTO "crm_Opportunities_Type" ("id", "__v", "name", "order")
SELECT gen_random_uuid(), 0, v.name, v.o
FROM (VALUES
  ('New client', 1),
  ('Existing client expansion', 2),
  ('Renewal / repeat', 3)
) AS v(name, o)
WHERE NOT EXISTS (SELECT 1 FROM "crm_Opportunities_Type" t WHERE t."name" = v.name);

INSERT INTO "Currency" ("code", "name", "symbol", "isEnabled", "isDefault", "createdAt", "updatedAt")
VALUES ('GBP', 'British Pound', '£', true, false, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE SET "isEnabled" = true, "updatedAt" = NOW();

UPDATE "Currency" SET "isDefault" = ("code" = 'GBP'), "updatedAt" = NOW();

INSERT INTO "crm_SystemSettings" ("key", "value", "updatedAt")
VALUES ('default_currency', 'GBP', NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = 'GBP', "updatedAt" = NOW();

COMMIT;

SELECT 'stage' AS kind, "name", "probability"::text AS detail FROM "crm_Opportunities_Sales_Stages"
UNION ALL SELECT 'type', "name", "order"::text FROM "crm_Opportunities_Type"
UNION ALL SELECT 'currency', "code", "isDefault"::text FROM "Currency"
UNION ALL SELECT 'setting', "key", "value" FROM "crm_SystemSettings" WHERE "key" = 'default_currency'
ORDER BY 1, 3;
