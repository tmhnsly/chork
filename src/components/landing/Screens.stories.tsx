import type { Meta, StoryObj } from "@storybook/nextjs";
import { DeviceFrame } from "./DeviceFrame";
import { CardScreen } from "./CardScreen";
import { BoardScreen } from "./BoardScreen";
import { GameScreen } from "./GameScreen";
import { CARD_STEPS } from "./screens/cardScreen";
import { BOARD_STEPS } from "./screens/boardScreen";
import { GAME_STEPS } from "./screens/gameScreen";

const meta = {
  title: "Landing/Device screens",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

const steps = (n: number) => Array.from({ length: n }, (_, i) => i);

export const Card: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {steps(CARD_STEPS).map((s) => (
        <DeviceFrame key={s} label={`Card, step ${s}`}><CardScreen step={s} /></DeviceFrame>
      ))}
    </div>
  ),
};

export const Board: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {steps(BOARD_STEPS).map((s) => (
        <DeviceFrame key={s} label={`Board, step ${s}`}><BoardScreen step={s} /></DeviceFrame>
      ))}
    </div>
  ),
};

export const Game: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {steps(GAME_STEPS).map((s) => (
        <DeviceFrame key={s} label={`Game, step ${s}`}><GameScreen step={s} /></DeviceFrame>
      ))}
    </div>
  ),
};
