import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser for Deep Degradation Validation...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    // Simulate Network Jitter and Slow API
    await context.route('**/session/*', async route => {
        const jitter = Math.random() * 1000 + 500; 
        await new Promise(r => setTimeout(r, jitter));
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                session_id: "degradation-mode",
                session_title: "Degradation Testing",
                topics: ["Topic A"],
                chat_history: []
            })
        });
    });

    const page = await context.newPage();
    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('FATAL')) {
            logs.push(`[WARN/ERR] ${text}`);
        }
    });

    console.log("Loading session.html with jitter...");
    await page.goto('http://localhost:3000/session.html?sessionId=degradation-mode');

    let results = await page.evaluate(async () => {
        let retries = 50;
        while (!window.__ws_manager && retries > 0) {
            await new Promise(r => setTimeout(r, 200));
            retries--;
        }
        
        if (!window.__ws_manager) return { error: "Session boot failed due to jitter" };
        const ws = window.__ws_manager;
        const res = {};

        // -------------------------------------------------------------------------
        // TEST 2: REAL NETWORK INSTABILITY (Duplicate WS Frames + Jitter)
        // -------------------------------------------------------------------------
        for (let i = 1; i <= 5; i++) {
            // Send exact same payload 3 times rapidly
            for (let j = 0; j < 3; j++) {
                setTimeout(() => {
                    ws._handleMessage({ data: JSON.stringify({
                        type: "mind_map_checkpoint",
                        message_id: i,
                        state: { topics: [], kwl: {} },
                        mind_map_data: { nodes: [{ point: `Dupe Widget ${i}`, kido_sentence: "Val" }] }
                    })});
                }, Math.random() * 100);
            }
        }

        await new Promise(r => setTimeout(r, 500));
        const initialWidgets = document.querySelectorAll('.kc-root');
        res.instability_rendered_count = initialWidgets.length; // Expected: 5 (duplicates ignored)

        // -------------------------------------------------------------------------
        // TEST 3: LONG-SESSION UI DRIFT TEST (5,000 DOM Elements)
        // -------------------------------------------------------------------------
        const driftStart = performance.now();
        for (let i = 0; i < 200; i++) {
            if (i % 2 === 0) {
                // Widget
                ws._handleMessage({ data: JSON.stringify({
                    type: "mind_map_checkpoint",
                    message_id: 1000 + i,
                    state: { topics: [], kwl: {} },
                    mind_map_data: { nodes: [{ point: `Drift Widget ${i}`, kido_sentence: "Val" }] }
                })});
            } else {
                // Text Message
                ws._handleMessage({ data: JSON.stringify({
                    type: "kido_response",
                    data: { kido_response: `Heavy drift message ${i}` }
                })});
            }
        }
        
        // Measure Reflow/Paint Stability
        await new Promise(r => requestAnimationFrame(r));
        const chatBox = document.getElementById('chat-messages');
        const reflowStart = performance.now();
        const height = chatBox.scrollHeight;
        res.reflow_latency_ms = performance.now() - reflowStart;
        res.total_dom_height = height;
        
        // -------------------------------------------------------------------------
        // TEST 1: BROWSER LIFECYCLE DEGRADATION (Closure Integrity)
        // -------------------------------------------------------------------------
        // We will simulate deep sleep by artificially freezing execution for a bit
        // then attempting to click a node that was generated 4000 nodes ago.
        
        await new Promise(r => setTimeout(r, 2000)); // Sleep simulation
        
        const allWidgets = document.querySelectorAll('.kc-root');
        res.total_widgets_survived = allWidgets.length;

        // Click the VERY FIRST widget from Test 2 (now deeply buried)
        const buriedStart = performance.now();
        if (allWidgets.length > 0) {
            allWidgets[0].querySelector('div').click();
        }
        res.buried_click_latency_ms = performance.now() - buriedStart;

        return res;
    });

    console.log("\n========================================");
    console.log("DEGRADATION MODE TEST RESULTS");
    console.log("========================================");
    console.log("Results:", results);
    console.log("Browser Console Warnings/Errors:");
    logs.forEach(l => console.log("  ", l));
    console.log("========================================\n");

    await browser.close();
    process.exit(0);
})();
