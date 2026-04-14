/**
 * Toast copy picker — tiny but worth pinning so a refactor that
 * accidentally returns undefined breaks the test instead of
 * shipping an empty toast.
 */
import { describe, it, expect } from "vitest";
import { pickSendMessage, SEND_MESSAGES, FLASH_MESSAGES } from "./send-messages";

describe("pickSendMessage", () => {
  it("returns a non-empty string", () => {
    expect(pickSendMessage(false)).toMatch(/.+/);
    expect(pickSendMessage(true)).toMatch(/.+/);
  });

  it("draws from SEND_MESSAGES on a non-flash", () => {
    for (let i = 0; i < 30; i++) {
      expect(SEND_MESSAGES).toContain(pickSendMessage(false));
    }
  });

  it("draws from FLASH_MESSAGES on a flash so flashes feel distinct", () => {
    for (let i = 0; i < 30; i++) {
      expect(FLASH_MESSAGES).toContain(pickSendMessage(true));
    }
  });
});
