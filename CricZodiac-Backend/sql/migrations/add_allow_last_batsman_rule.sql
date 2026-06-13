ALTER TABLE `series`
  ADD COLUMN `allow_last_batsman` TINYINT(1) NOT NULL DEFAULT 0 AFTER `end_date`;

ALTER TABLE `matches`
  ADD COLUMN `allow_last_batsman` TINYINT(1) NOT NULL DEFAULT 0 AFTER `players_per_team`;
