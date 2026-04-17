import { expect, type Page } from "@playwright/test";

export const selectors = {
  lobbyNicknameInput: '[data-testid="lobby-nickname-input"]',
  createRoomNameInput: '[data-testid="create-room-name-input"]',
  createRoomPasswordInput: '[data-testid="create-room-password-input"]',
  createRoomSubmit: '[data-testid="create-room-submit"]',
  waitingInvitePanel: '[data-testid="waiting-room-invite-panel"]',
  inviteLinkValue: '[data-testid="invite-link-value"]',
  waitingReadyToggle: '[data-testid="waiting-ready-toggle"]',
  waitingStartGame: '[data-testid="waiting-start-game"]',
  waitingLeaveTable: '[data-testid="waiting-leave-table"]',
  heroSeatAnchor: '[data-testid="hero-seat-anchor"]',
  tournamentTable: '[data-testid="tournament-table"]',
  lobbyRoomList: '[data-testid="lobby-room-list"]',
} as const;

export function buildRoomSelectors(code: string) {
  return {
    joinButton: `[data-testid="room-join-button-${code}"]`,
    lockMarker: `[data-testid="room-lock-marker-${code}"]`,
    passwordPrompt: `[data-testid="room-password-prompt-${code}"]`,
    passwordInput: `[data-testid="room-password-input-${code}"]`,
    passwordSubmit: `[data-testid="room-password-submit-${code}"]`,
    passwordError: `[data-testid="room-password-error-${code}"]`,
  };
}

export function uniqueRoomName(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export async function bootstrapGuest(page: Page, nickname: string) {
  await page.goto("/");
  await page.locator(selectors.lobbyNicknameInput).fill(nickname);
}

export async function createPrivateRoom(page: Page, roomName: string, password: string) {
  await page.getByTestId("visibility-option-private").click();
  await page.locator(selectors.createRoomNameInput).fill(roomName);
  await page.locator(selectors.createRoomPasswordInput).fill(password);
  await page.locator(selectors.createRoomSubmit).click();
}

export function extractTournamentCode(url: string) {
  return /\/tournaments\/([^/?#]+)/.exec(url)?.[1] ?? null;
}

export async function expectTournamentTableReady(page: Page) {
  await expect(page).toHaveURL(/\/tournaments\/[^/?#]+$/);
  await expect(page.locator(selectors.tournamentTable)).toBeVisible();
}

export async function createPrivateRoomAndCaptureCode(page: Page, roomName: string, password: string) {
  await createPrivateRoom(page, roomName, password);
  await expectTournamentTableReady(page);
  const tournamentCode = extractTournamentCode(page.url());
  expect(tournamentCode).toBeTruthy();
  return tournamentCode!;
}

export async function expectWaitingOwnerControls(page: Page) {
  await expect(page.locator(selectors.waitingInvitePanel)).toBeVisible();
  await expect(page.locator(selectors.inviteLinkValue)).toBeVisible();
  await expect(page.locator(selectors.waitingReadyToggle)).toBeVisible();
  await expect(page.locator(selectors.waitingStartGame)).toBeVisible();
  await expect(page.locator(selectors.waitingLeaveTable)).toBeVisible();
}
