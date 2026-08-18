/**
 * Starfinder-side helpers: the system's quick-roll setting, and reading what a
 * roll put in chat.
 */

/**
 * Turn the roll configuration dialog off for the duration of a test.
 *
 * `DiceSFRPG.d20Roll()` reads `sfrpg.useQuickRollAsDefault` to decide whether to
 * raise the dialog, so setting it lets a test assert on the resulting chat
 * message instead of driving a dialog. Returns the previous value.
 */
export async function setQuickRoll(page, enabled) {
    return page.evaluate(async (value) => {
        const previous = game.settings.get('sfrpg', 'useQuickRollAsDefault');
        await game.settings.set('sfrpg', 'useQuickRollAsDefault', value);
        return previous;
    }, enabled);
}

export async function chatMessageCount(page) {
    return page.evaluate(() => game.messages.size);
}

/**
 * Wait for chat to grow past `before` and return the newest message's text.
 *
 * Reads game.messages rather than the rendered log: a message is in the
 * collection as soon as it is created, while the log element lags behind it.
 */
export async function waitForChatMessage(page, before, timeout = 15_000) {
    await page.waitForFunction(count => game.messages.size > count, before, { timeout });
    return page.evaluate(() => {
        const message = game.messages.contents.at(-1);
        const html = document.createElement('div');
        html.innerHTML = message.content ?? '';
        return {
            flavor: message.flavor ?? '',
            text: html.textContent ?? '',
            rollCount: message.rolls?.length ?? 0
        };
    });
}

export async function clearChat(page) {
    await page.evaluate(async () => {
        await ChatMessage.deleteDocuments(game.messages.contents.map(m => m.id));
    });
}

/**
 * Answer the trained-only confirmation `rollSkill()` raises for a player-owned
 * actor attempting an untrained skill. The suite's actors are GM-owned, so this
 * is only needed by tests that deliberately give a player ownership.
 */
export async function answerTrainedOnlyPrompt(page, proceed) {
    await page.waitForFunction(
        () => [...document.querySelectorAll('.app.window-app.dialog')]
            .some(d => d.querySelector('button[data-button="yes"], button.yes')),
        null,
        { timeout: 10_000 }
    );
    await page.evaluate((yes) => {
        const dialog = [...document.querySelectorAll('.app.window-app.dialog')]
            .find(d => d.querySelector('button[data-button="yes"], button.yes'));
        if (!dialog) throw new Error('Trained-only confirmation dialog not found');
        const selector = yes
            ? 'button[data-button="yes"], button.yes'
            : 'button[data-button="cancel"], button.cancel';
        const button = dialog.querySelector(selector);
        if (!button) throw new Error(`No ${yes ? 'yes' : 'cancel'} button in the confirmation dialog`);
        button.click();
    }, proceed);
}
