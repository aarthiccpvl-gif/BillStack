-- Persist the user's round-off intent.
--
-- A round-off amount of zero is ambiguous: it means either "rounding is switched
-- off" or "the total was already whole". Inferring the setting from the amount
-- silently disabled rounding on the next edit of any document whose total landed
-- on a whole unit. The flag records what was asked for; the amount records what
-- it produced.
ALTER TABLE `quotations` ADD COLUMN `round_off_enabled` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `invoices` ADD COLUMN `round_off_enabled` BOOLEAN NOT NULL DEFAULT true;
