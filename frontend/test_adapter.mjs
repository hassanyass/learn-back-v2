import { MindMapAdapter } from './js/adapters/MindMapAdapter.js';

console.log("========================================");
console.log("1. TESTING NEW WS PAYLOAD FORMAT");
console.log("========================================");
const newPayload = {
    nodes: [
        {
            point: "Cellular Structure",
            kido_sentence: "Cells are the building blocks of life."
        }
    ]
};
console.log("Input:", JSON.stringify(newPayload, null, 2));
console.log("Output:", JSON.stringify(MindMapAdapter.normalize(newPayload), null, 2));


console.log("\n========================================");
console.log("2. TESTING LEGACY KC FORMAT (ARRAY)");
console.log("========================================");
const legacyPayload = [
    {
        title: "Mitosis",
        thought: "Cell division resulting in two identical cells."
    }
];
console.log("Input:", JSON.stringify(legacyPayload, null, 2));
console.log("Output:", JSON.stringify(MindMapAdapter.normalize(legacyPayload), null, 2));


console.log("\n========================================");
console.log("3. TESTING PARTIAL / NULL / MIXED DATA");
console.log("========================================");
const mixedPayload = [
    { point: "Missing Value" }, // Missing value
    { title: "Missing Label", summary: "This has a summary instead of kido_sentence" }, // Mixed keys
    null, // Completely null node
    {}, // Empty node
    { label: "Already Canonical", value: "Canonical value", status: "reviewed", correction: "My fix" } // Existing canonical
];
console.log("Input:", JSON.stringify(mixedPayload, null, 2));
console.log("Output:", JSON.stringify(MindMapAdapter.normalize(mixedPayload), null, 2));
