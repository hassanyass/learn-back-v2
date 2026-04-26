import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    // Intercept API calls so session.js boots successfully without a backend
    await context.route('**/session/*', async route => {
        const mockSessionData = {
            session_id: "test-session-123",
            session_title: "Test Session",
            topics: ["Topic 1", "Topic 2"],
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
    
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('[Session]')) {
            console.log('BROWSER CONSOLE:', msg.text());
        }
    });

    console.log("Loading session.html via HTTP server...");
    // Load via local HTTP server to avoid CORS issues for ES modules
    await page.goto('http://localhost:3000/session.html?sessionId=test-session-123');

    console.log("Injecting Mock WebSocket payload...");
    
    // Simulate receiving the mind_map_checkpoint WS payload
    const outputText = await page.evaluate(async () => {
        // Wait for session.js to initialize
        let retries = 10;
        while (!window.__ws_manager && retries > 0) {
            await new Promise(r => setTimeout(r, 200));
            retries--;
        }
        
        if (!window.__ws_manager) {
            return "ERROR: window.__ws_manager not found (session.js boot failed)";
        }
        
        const mockPayload = {
            type: "mind_map_checkpoint",
            state: {
                topics: [],
                kwl: { k: [], w: [], l: [] }
            },
            mind_map_data: {
                topic_title: "Biology",
                nodes: [
                    {
                        point: "Cellular Structure",
                        kido_sentence: "Cells are the building blocks of life."
                    }
                ]
            }
        };

        // Pass message string as it would come from network
        window.__ws_manager._handleMessage({ data: JSON.stringify(mockPayload) });
        
        // Let DOM update and render the widget
        await new Promise(r => setTimeout(r, 200));
        
        const dbg = document.getElementById('debug-output');
        let initialText = dbg ? dbg.textContent : "ERROR: No debug-output rendered";

        // Simulate click interaction to trigger callback
        const nodeElements = document.querySelectorAll('.kc-root > div');
        if (nodeElements.length > 0) {
            nodeElements[0].click();
            await new Promise(r => setTimeout(r, 100)); // wait for callback to run
            initialText = dbg.textContent; // Update text after callback
        } else {
            initialText += "\nERROR: No node elements rendered in DOM.";
        }

        return initialText;
    });

    console.log("\n========================================");
    console.log("BROWSER INTEGRATION TEST RESULTS");
    console.log("========================================");
    console.log(outputText);
    console.log("========================================\n");

    await browser.close();
    process.exit(0);
})();
