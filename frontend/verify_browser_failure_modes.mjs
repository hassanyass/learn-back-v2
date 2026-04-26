import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser for Real-World Failure Mode Validation...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    // -------------------------------------------------------------------------
    // TEST 1: NETWORK TIMING VARIABILITY (Out-of-order execution)
    // -------------------------------------------------------------------------
    // We will delay the REST API intentionally to test the boundary. 
    // Actually, session.js doesn't open WS until REST completes, but we can mock
    // a scenario where history is loaded, and then a duplicate WS event arrives 
    // exactly simultaneously with a UI interaction.
    
    const mockHistory = [
        {
            id: 1,
            sender_role: "system",
            widget_type: "MIND_MAP",
            widget_data: { nodes: [{ point: "Test", kido_sentence: "Val" }] },
            created_at: new Date().toISOString()
        }
    ];

    await context.route('**/session/*', async route => {
        await new Promise(r => setTimeout(r, 500)); // Simulate slow network
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                session_id: "failure-mode",
                session_title: "Failure Testing",
                topics: ["Topic A"],
                chat_history: mockHistory
            })
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

    console.log("Loading session.html...");
    await page.goto('http://localhost:3000/session.html?sessionId=failure-mode');

    let results = await page.evaluate(async () => {
        let retries = 20;
        while (!window.__ws_manager && retries > 0) {
            await new Promise(r => setTimeout(r, 200));
            retries--;
        }
        
        if (!window.__ws_manager) return { error: "Session boot failed" };
        const ws = window.__ws_manager;
        const res = {};

        // -------------------------------------------------------------------------
        // TEST 3: PARTIAL FAILURE RECOVERY (Data Corruption)
        // -------------------------------------------------------------------------
        // Corrupted payload: null state, undefined data
        try {
            ws._handleMessage({ data: JSON.stringify({
                type: "mind_map_checkpoint",
                message_id: 999,
                state: null,
                mind_map_data: null
            })});
            res.corruption_recovery = "Graceful";
        } catch (e) {
            res.corruption_recovery = "Crashed";
        }

        // Malformed array
        try {
            ws._handleMessage({ data: JSON.stringify({
                type: "mind_map_checkpoint",
                message_id: 1000,
                state: {},
                mind_map_data: "This is a string, not an object"
            })});
            res.malformed_recovery = "Graceful";
        } catch (e) {
            res.malformed_recovery = "Crashed";
        }

        // -------------------------------------------------------------------------
        // TEST 2: LONG-HORIZON MEMORY STABILITY TEST
        // Simulate 30-60 mins of load: 100 Mind Map Widgets, 500 text messages
        // -------------------------------------------------------------------------
        const startTime = performance.now();
        
        for (let i = 2000; i < 2100; i++) {
            ws._handleMessage({ data: JSON.stringify({
                type: "mind_map_checkpoint",
                message_id: i,
                state: { topics: [], kwl: {} },
                mind_map_data: { nodes: [{ point: `Memory Widget ${i}`, kido_sentence: "Val" }] }
            })});
        }
        
        for (let i = 3000; i < 3500; i++) {
            ws._handleMessage({ data: JSON.stringify({
                type: "kido_response",
                data: { kido_response: `Long session message ${i}` }
            })});
        }

        await new Promise(r => setTimeout(r, 1000)); // Allow DOM to process
        
        const widgets = document.querySelectorAll('.kc-root');
        res.total_widgets_rendered = widgets.length; // Expected: 1 (history) + 2 (corrupted) + 100 = 103
        
        const endTime = performance.now();
        res.render_time_ms = endTime - startTime;
        
        // Memory stability proof: ensure interaction remains instant
        const interactStart = performance.now();
        if (widgets.length > 50) {
            widgets[50].querySelector('div').click();
        }
        res.click_latency_ms = performance.now() - interactStart;

        return res;
    });

    console.log("\n========================================");
    console.log("FAILURE MODE TEST RESULTS");
    console.log("========================================");
    console.log("Results:", results);
    console.log("Browser Console Warnings/Errors:");
    logs.forEach(l => console.log("  ", l));
    console.log("========================================\n");

    await browser.close();
    process.exit(0);
})();
