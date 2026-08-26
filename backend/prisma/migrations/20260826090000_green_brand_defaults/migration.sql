-- Application brand refresh: the navy/Inter identity becomes green/Poppins.
--
-- These are column defaults, i.e. what a *new* installation starts with. The
-- existing row is migrated too, but only where it still holds the old default:
-- a company that has chosen its own brand colours must keep them.
ALTER TABLE `company_settings`
  ALTER COLUMN `primary_color` SET DEFAULT '#1b5e40',
  ALTER COLUMN `secondary_color` SET DEFAULT '#6b7770',
  ALTER COLUMN `default_font` SET DEFAULT 'Poppins';

UPDATE `company_settings` SET `primary_color` = '#1b5e40' WHERE LOWER(`primary_color`) = '#0f5477';
UPDATE `company_settings` SET `secondary_color` = '#6b7770' WHERE LOWER(`secondary_color`) = '#5e6f7c';
UPDATE `company_settings` SET `default_font` = 'Poppins' WHERE `default_font` = 'Inter';

-- The seeded template versions carry the old palette inside their config JSON,
-- and a published version is immutable because documents render from it: change
-- one and you change how an already-issued invoice reprints. So this repaints
-- only versions that no quotation and no invoice references, and only where the
-- colour is still the seeded navy. Anything a user has customised, and anything
-- a real document depends on, is left exactly as it is.
UPDATE `template_versions` tv
SET tv.`config_json` = JSON_SET(
      tv.`config_json`,
      '$.branding.colors.primary', '#1B5E40',
      '$.branding.colors.secondary', '#6B7770',
      '$.branding.colors.text', '#131C17',
      '$.branding.colors.muted', '#6B7770',
      '$.branding.colors.border', '#D8DED6',
      '$.branding.colors.tableHeaderBg', '#EDF3E7',
      '$.branding.colors.tableHeaderText', '#131C17'
    )
WHERE JSON_UNQUOTE(JSON_EXTRACT(tv.`config_json`, '$.branding.colors.primary')) = '#0F5477'
  AND NOT EXISTS (SELECT 1 FROM `quotations` q WHERE q.`template_version_id` = tv.`id`)
  AND NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.`template_version_id` = tv.`id`);

-- Same rule for the face: the sans stack becomes the application's own Poppins,
-- which the renderer embeds. The classic layout keeps its serif.
UPDATE `template_versions` tv
SET tv.`config_json` = JSON_SET(tv.`config_json`, '$.typography.fontFamily', 'poppins')
WHERE JSON_UNQUOTE(JSON_EXTRACT(tv.`config_json`, '$.typography.fontFamily')) = 'sans'
  AND NOT EXISTS (SELECT 1 FROM `quotations` q WHERE q.`template_version_id` = tv.`id`)
  AND NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.`template_version_id` = tv.`id`);
