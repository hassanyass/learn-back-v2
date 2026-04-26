import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser for Stress Validation...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    // Create a mock history with interleaved messages (Test 2: Mixed History)
    const mockHistory = [];
    for (let i = 1; i <= 50; i++) {
        if (i % 5 === 0) {
            mockHistory.push({
                id: i,
                sender_role: "system",
                widget_type: "MIND_MAP",
                widget_data: { nodes: [{ point: `Historical Widget ${i}`, kido_sentence: `Value ${i}` }] },
                created_at: new Date(Date.now() + i * 1000).toISOString()
            });
        } else {
            mockHistory.push({
                id: i,
                sender_role: i % 2 === 0 ? "kido" : "user",
                message_text: `Historical message ${i}`,
                widget_type: "TEXT",
                widget_data: null,
                created_at: new Date(Date.now() + i * 1000).toISOString()
            });
        }
    }

    await context.route('**/session/*', async route => {
        const mockSessionData = {
            session_id: "test-session-stress",
            session_title: "Stress Session",
            topics: ["Topic A", "Topic B"],
            topic_index: 0,
            chat_history: mockHistory,
            kwl: { k: [], w: [], l: [] }
        };
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockSessionData)
        });
    });

    const page = await context.newPage();
    
    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('FATAL') || text.includes('Duplicate')) {
            logs.push(`[WARN/ERR] ${text}`);
        }
    });

    console.log("Loading session.html (Boot & Mixed History Test)...");
    await page.goto('http://localhost:3000/session.html?sessionId=test-session-stress');

    console.log("Executing Stress Scenarios...");
    
    let results = await page.evaluate(async () => {
        let retries = 20;
        while (!window.__ws_manager && retries > 0) {
            await new Promise(r => setTimeout(r, 200));
            retries--;
        }
        
        if (!window.__ws_manager) return { error: "Session boot failed" };

        const ws = window.__ws_manager;
        const res = {};

        // ----------------------------------------------------
        // TEST 1 & 2: Mixed History & Long Session Verification
        // ----------------------------------------------------
        const widgets = document.querySelectorAll('.kc-root');
        const allMessages = document.querySelectorAll('.message');
        res.historical_widgets_rendered = widgets.length; // Expected: 10
        res.total_messages_rendered = allMessages.length; // Expected: 50 + potential hud messages

        // ----------------------------------------------------
        // TEST 3: Rapid Fire Stress Test
        // Inject 5 identical mind map payloads rapidly
        // ----------------------------------------------------
        for (let i = 100; i < 105; i++) {
            ws._handleMessage({ data: JSON.stringify({
                type: "mind_map_checkpoint",
                message_id: i,
                state: { topics: [], kwl: { k: [], w: [], l: [] } },
                mind_map_data: { nodes: [{ point: `Rapid Widget ${i}`, kido_sentence: "Value" }] }
            })});
        }

        await new Promise(r => setTimeout(r, 500)); // wait for renders
        const updatedWidgets = document.querySelectorAll('.kc-root');
        res.widgets_after_rapid_fire = updatedWidgets.length; // Expected: 15
        
        // Attempt to click one of the rapid-fire widgets to ensure closures didn't leak
        if (updatedWidgets.length === 15) {
            const lastWidgetNode = updatedWidgets[14].querySelector('div');
            lastWidgetNode.click(); // Should mutate state and fire callback
        }

        return res;
    });

    // ----------------------------------------------------
    // TEST 4: Browser Lifecycle Test (Reload)
    // ----------------------------------------------------
    console.log("Reloading page for Lifecycle Test...");
    await page.reload();

    const reloadResults = await page.evaluate(async () => {
        let retries = 20;
        while (!window.__ws_manager && retries > 0) {
            await new Promise(r => setTimeout(r, 200));
            retries--;
        }
        const widgets = document.querySelectorAll('.kc-root');
        return {
            widgets_rehydrated_after_reload: widgets.length // Expected: 10 (from history)
        };
    });

    console.log("\n========================================");
    console.log("STRESS TEST RESULTS");
    console.log("========================================");
    console.log("Initial Boot & Stress:", results);
    console.log("Lifecycle Reload Test:", reloadResults);
    console.log("Browser Console Warnings/Errors:");
    logs.forEach(l => console.log("  ", l));
    console.log("========================================\n");

    await browser.close();
    process.exit(0);
})();
