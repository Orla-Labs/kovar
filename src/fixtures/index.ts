import { test as baseTest } from "@playwright/test";
import { SecurityFixture } from "./security-fixture.js";

type KovarFixtures = {
	security: SecurityFixture;
};

export const test = baseTest.extend<KovarFixtures>({
	security: async ({ page, context, request }, use, testInfo) => {
		const fixture = new SecurityFixture(page, context, request);
		fixture.setTestInfo(testInfo);
		await use(fixture);
		await fixture.cleanup();
	},
});
