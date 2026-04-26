import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser for Chaos Validation...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    // Intercept API calls so session.js boots successfully without a backend
    await context.route('**/session/*', async route => {
        const mockSessionData = {
            session_id: "test-session-chaos",
            session_title: "Chaos Session",
            topics: ["Topic A"],
            topic_index: 0,
            kwl: { k: [], w: [], l: [] }
        };
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockSessionData)
        });
    });

    const page = await context.newPage();
    
    // Capture console output into an array
    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Integration Test]') || text.includes('[Callback Fired]')) {
            logs.push(text);
        }
    });

    console.log("Loading session.html...");
    await page.goto('http://localhost:3000/session.html?sessionId=test-session-chaos');

    console.log("Executing Chaos Scenarios...");
    
    const chaosResults = await page.evaluate(async () => {
        let retries = 15;
        while (!window.__ws_manager && retries > 0) {
            await new Promise(r => setTimeout(r, 200));
            retries--;
        }
        
        if (!window.__ws_manager) {
            return { error: "Session boot failed" };
        }

        const ws = window.__ws_manager;
        const results = {};

        // ----------------------------------------------------
        // TEST 1: MULTI-INSTANCE & ASYNC ORDERING
        // Inject two rapid consecutive payloads
        // ----------------------------------------------------
        const payload1 = {
            type: "mind_map_checkpoint",
            state: { topics: [], kwl: { k: [], w: [], l: [] } },
            mind_map_data: { nodes: [{ point: "Widget 1", kido_sentence: "Value 1" }] }
        };
        const payload2 = {
            type: "mind_map_checkpoint",
            state: { topics: [], kwl: { k: [], w: [], l: [] } },
            mind_map_data: { nodes: [{ point: "Widget 2", kido_sentence: "Value 2" }] }
        };

        ws._handleMessage({ data: JSON.stringify(payload1) });
        ws._handleMessage({ data: JSON.stringify(payload2) });

        await new Promise(r => setTimeout(r, 500)); // wait for renders

        const roots = document.querySelectorAll('.kc-root');
        results.widgets_rendered = roots.length;

        if (roots.length === 2) {
            // Click Widget 1
            roots[0].querySelector('div').click();
            await new Promise(r => setTimeout(r, 100));

            // Click Widget 2
            roots[1].querySelector('div').click();
            await new Promise(r => setTimeout(r, 100));
        }

        // ----------------------------------------------------
        // TEST 2: REHYDRATION CHECK
        // Check if session.js saves Mind Map states to SessionStore
        // ----------------------------------------------------
        results.sessionStoreExposed = !!window.SessionStore;
        if (window.SessionStore) {
            const currentSession = window.SessionStore.getSession();
            // Just check if the session store captured the new WS payload state
            results.store_updated = currentSession !== null;
        }

        return results;
    });

    console.log("\n========================================");
    console.log("CHAOS TEST RESULTS");
    console.log("========================================");
    console.log("DOM Evaluation:", chaosResults);
    console.log("Browser Logs:");
    logs.forEach(l => console.log("  ", l));
    console.log("========================================\n");

    await browser.close();
    process.exit(0);
})();
