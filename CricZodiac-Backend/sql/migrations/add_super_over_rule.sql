-- Enable optional, repeatable super overs for tied matches.
ALTER TABLE `series`
  ADD COLUMN `allow_super_over` TINYINT(1) NOT NULL DEFAULT 0 AFTER `allow_last_batsman`;

ALTER TABLE `matches`
  ADD COLUMN `allow_super_over` TINYINT(1) NOT NULL DEFAULT 0 AFTER `allow_last_batsman`;

ALTER TABLE `innings`
  ADD COLUMN `is_super_over` TINYINT(1) NOT NULL DEFAULT 0 AFTER `innings_number`,
  ADD COLUMN `super_over_number` TINYINT UNSIGNED NULL AFTER `is_super_over`;
