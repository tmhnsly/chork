-- 078: remap stored theme preferences onto the new four-palette set
--
-- The six themes were built to the rule "one per Radix gray scale",
-- which is why they looked alike — Radix's grays are designed to be
-- near-identical, and three of the six accents (iris, violet, plum)
-- were all blue-purple. The replacement set leads with the accent:
-- Chork (lime), Blue, Violet, Pink.
--
-- `profiles.theme` is free text with no CHECK constraint, and the
-- client already falls back to the default for any name it doesn't
-- recognise, so nothing breaks without this migration. It exists so a
-- climber who deliberately chose a palette lands on its nearest
-- surviving relative instead of being silently reset to the brand
-- green.
--
-- Mapped by accent hue, since that's what they were actually picking:
--
--   slate  (slate + iris,   blue-violet)  → blue
--   gray   (gray  + violet, purple)       → violet   [same accent]
--   mauve  (mauve + plum,   purple-pink)  → pink
--   sand   (sand  + tomato, red-orange)   → pink     [nearest warm]
--   sage   (sage  + jade,   green)        → default  [the green one]
--
-- `sand` is the loosest fit: tomato is red-orange and pink is
-- magenta. Nothing warm survives — amber belongs to flash and the
-- podium's gold, orange to warnings, red to destructive actions, and
-- bronze to third place — so pink is genuinely the closest remaining
-- option rather than a lazy default.

update public.profiles set theme = 'blue'    where theme = 'slate';
update public.profiles set theme = 'violet'  where theme = 'gray';
update public.profiles set theme = 'pink'    where theme in ('mauve', 'sand');
update public.profiles set theme = 'default' where theme = 'sage';
