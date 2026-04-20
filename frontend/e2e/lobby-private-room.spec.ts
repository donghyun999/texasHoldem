import { expect, test } from "@playwright/test";
import {
  bootstrapGuest,
  buildRoomSelectors,
  createPrivateRoomAndCaptureCode,
  expectTournamentTableReady,
  expectWaitingOwnerControls,
  selectors,
  uniqueRoomName,
} from "./fixtures";

test.describe("private room lobby and table smoke", () => {
  test("owner keeps waiting-room controls and hero seat anchor after creating a private room", async ({ page }) => {
    const roomName = uniqueRoomName("e2e-private-owner");

    await bootstrapGuest(page, "owner-e2e");
    await createPrivateRoomAndCaptureCode(page, roomName, "2468");

    await expect(page.locator(selectors.heroSeatAnchor)).toHaveAttribute("data-self-seat", "true");
    await expectWaitingOwnerControls(page);
  });

  test("private room appears in the lobby with a lock marker and password prompt", async ({ browser }) => {
    const roomName = uniqueRoomName("e2e-private-lobby");
    const ownerPage = await browser.newPage();
    const viewerPage = await browser.newPage();

    try {
      await bootstrapGuest(ownerPage, "owner-lobby-e2e");
      const tournamentCode = await createPrivateRoomAndCaptureCode(ownerPage, roomName, "3579");

      await bootstrapGuest(viewerPage, "viewer-lobby-e2e");
      await expect(viewerPage.locator(selectors.lobbyRoomList)).toContainText(roomName);

      const room = buildRoomSelectors(tournamentCode);
      await expect(viewerPage.locator(room.lockMarker)).toBeVisible();
      await viewerPage.locator(room.joinButton).click();
      await expect(viewerPage.locator(room.passwordPrompt)).toBeVisible();
      await expect(viewerPage.locator(room.passwordInput)).toBeVisible();
    } finally {
      await ownerPage.close();
      await viewerPage.close();
    }
  });

  test("wrong password for a private room keeps the prompt open and shows the error path", async ({ browser }) => {
    const roomName = uniqueRoomName("e2e-private-wrong-password");
    const ownerPage = await browser.newPage();
    const viewerPage = await browser.newPage();

    try {
      await bootstrapGuest(ownerPage, "owner-wrong-password");
      const tournamentCode = await createPrivateRoomAndCaptureCode(ownerPage, roomName, "8642");
      const room = buildRoomSelectors(tournamentCode);

      await bootstrapGuest(viewerPage, "viewer-wrong-password");
      await expect(viewerPage.locator(selectors.lobbyRoomList)).toContainText(roomName);

      await viewerPage.locator(room.joinButton).click();
      await expect(viewerPage.locator(room.passwordPrompt)).toBeVisible();
      await viewerPage.locator(room.passwordInput).fill("0000");
      await viewerPage.locator(room.passwordSubmit).click();

      await expect(viewerPage).toHaveURL(/\/$/);
      await expect(viewerPage.locator(room.passwordPrompt)).toBeVisible();
      await expect(viewerPage.locator(room.passwordError)).toBeVisible();
      await expect(viewerPage.locator(room.passwordError)).not.toHaveText("");
      await expect(viewerPage.locator(room.passwordInput)).toHaveValue("0000");
    } finally {
      await ownerPage.close();
      await viewerPage.close();
    }
  });

  test("reloading a seated owner page preserves hero bottom anchor and waiting-room controls", async ({ page }) => {
    const roomName = uniqueRoomName("e2e-private-reload");

    await bootstrapGuest(page, "owner-reload-e2e");
    await createPrivateRoomAndCaptureCode(page, roomName, "1597");
    await expect(page.locator(selectors.heroSeatAnchor)).toHaveAttribute("data-self-seat", "true");
    await expectWaitingOwnerControls(page);

    await page.reload();

    await expectTournamentTableReady(page);
    await expect(page.locator(selectors.heroSeatAnchor)).toHaveAttribute("data-self-seat", "true");
    await expect(page.locator(selectors.heroSeatAnchor)).toHaveAttribute("data-table-position-index", "4");
    await expectWaitingOwnerControls(page);
  });

  test("owner invite panel persists on the waiting-room page after reload", async ({ page }) => {
    const roomName = uniqueRoomName("e2e-private-invite-reload");

    await bootstrapGuest(page, "owner-invite-reload");
    const tournamentCode = await createPrivateRoomAndCaptureCode(page, roomName, "7531");

    await expectWaitingOwnerControls(page);
    await expect(page.locator(selectors.inviteLinkValue)).toContainText(`/tournaments/${tournamentCode}`);

    await page.reload();

    await expectTournamentTableReady(page);
    await expectWaitingOwnerControls(page);
    await expect(page.locator(selectors.inviteLinkValue)).toContainText(`/tournaments/${tournamentCode}`);
  });
});
