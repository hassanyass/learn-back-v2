import React, { useMemo } from 'react';

/**
 * DummyCharacterV3 — Interactive Expressions
 * 
 * Props:
 *  expression: 'dummy' | 'bored' | 'happy' | 'clever'
 *  
 * V3 builds on the organic V2 geometry but adds dynamic
 * paths for eyes, brows, and mouth to support multiple states.
 */
const DummyCharacterV3 = ({ width = 300, height = 300, className, style, expression = 'dummy' }) => {

    // Define expression states
    const config = useMemo(() => {
        switch (expression) {
            case 'bored':
                return {
                    eyebrowL: "M106,60 Q118,60 132,60", // Flat, low
                    eyebrowR: "M168,60 Q182,60 194,60",
                    eyeLid: 1, // Half-closed
                    pupilL: { cx: 122, cy: 82 }, // Looking down/center
                    pupilR: { cx: 178, cy: 82 },
                    mouth: "M140,110 L160,110", // Flat line
                    animSpeed: "6s"
                };
            case 'happy':
                return {
                    eyebrowL: "M106,50 Q118,40 132,50", // High arch
                    eyebrowR: "M168,50 Q182,40 194,50",
                    eyeLid: 0,
                    pupilL: { cx: 122, cy: 80 }, // Center
                    pupilR: { cx: 178, cy: 80 },
                    mouth: "M136,108 Q150,124 164,108 Z", // Open smile (D-shape)
                    animSpeed: "2.5s"
                };
            case 'clever':
                return {
                    eyebrowL: "M106,58 Q118,60 132,56", // Furrowed low
                    eyebrowR: "M168,44 Q182,36 194,44", // Raised high (The Rock style)
                    eyeLid: 0,
                    pupilL: { cx: 126, cy: 78 }, // Side glance right
                    pupilR: { cx: 182, cy: 78 },
                    mouth: "M140,110 Q150,112 160,106", // Smirk
                    animSpeed: "4s"
                };
            case 'dummy':
            default:
                return {
                    eyebrowL: "M106,48 Q116,40 126,46", // High small floaters
                    eyebrowR: "M174,46 Q184,40 194,48",
                    eyeLid: 0,
                    pupilL: { cx: 120, cy: 82 }, // Cross-eyed
                    pupilR: { cx: 180, cy: 82 },
                    mouth: "M142,108 Q150,114 158,108", // Tiny confused smile
                    animSpeed: "4s"
                };
        }
    }, [expression]);

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width={width} height={height} className={className} style={{ ...style, animationDuration: config.animSpeed }}>
            <defs>
                <radialGradient id="v3-gs" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(0,0,0,0.16)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" /></radialGradient>
                <radialGradient id="v3-sk" cx="40%" cy="25%" r="65%"><stop offset="0%" stopColor="#C49AAC" /><stop offset="40%" stopColor="#A67A8E" /><stop offset="100%" stopColor="#8B6078" /></radialGradient>
                <linearGradient id="v3-bs" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(40,18,30,0.12)" /><stop offset="18%" stopColor="rgba(40,18,30,0)" /><stop offset="82%" stopColor="rgba(40,18,30,0)" /><stop offset="100%" stopColor="rgba(40,18,30,0.12)" /></linearGradient>
                <radialGradient id="v3-hg" cx="35%" cy="20%" r="40%"><stop offset="0%" stopColor="rgba(255,255,255,0.12)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" /></radialGradient>
                <linearGradient id="v3-ov" x1=".5" y1="0" x2=".5" y2="1"><stop offset="0%" stopColor="#A48B9A" /><stop offset="100%" stopColor="#957D8C" /></linearGradient>
                <linearGradient id="v3-ar" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#AB8094" /><stop offset="100%" stopColor="#916980" /></linearGradient>
                <linearGradient id="v3-as" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(40,18,30,0.08)" /><stop offset="100%" stopColor="rgba(40,18,30,0.15)" /></linearGradient>

                {/* Eyelid mask for bored expression */}
                <mask id="v3-lid-L">
                    <rect x="0" y="0" width="300" height="300" fill="white" />
                    {config.eyeLid && <rect x="0" y="0" width="300" height="78" fill="black" />}
                </mask>
                <mask id="v3-lid-R">
                    <rect x="0" y="0" width="300" height="300" fill="white" />
                    {config.eyeLid && <rect x="0" y="0" width="300" height="78" fill="black" />}
                </mask>
            </defs>

            {/* Shadow */}
            <ellipse cx="150" cy="288" rx="72" ry="7" fill="url(#v3-gs)" />

            {/* Left Arm */}
            <path d="M52,148 Q30,165 24,200 Q20,230 26,242 Q28,248 34,248 Q40,248 44,244 Q48,240 50,220 Q50,186 52,148 Z" fill="url(#v3-ar)" stroke="#5A3E50" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M52,148 Q30,165 24,200 Q20,230 26,242 Q28,248 34,248 Q40,248 44,244 Q48,240 50,220 Q50,186 52,148 Z" fill="url(#v3-as)" />

            {/* Right Arm */}
            <path d="M248,148 Q270,165 276,200 Q280,230 274,242 Q272,248 266,248 Q260,248 256,244 Q252,240 250,220 Q250,186 248,148 Z" fill="url(#v3-ar)" stroke="#5A3E50" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M248,148 Q270,165 276,200 Q280,230 274,242 Q272,248 266,248 Q260,248 256,244 Q252,240 250,220 Q250,186 248,148 Z" fill="url(#v3-as)" />

            {/* Body */}
            <path d="M150,12 Q210,12 242,48 Q260,72 256,100 Q254,120 246,136 Q250,150 250,175 Q252,200 250,222 Q246,242 226,248 L218,248 Q220,262 218,270 Q216,278 200,278 L168,278 Q162,278 160,272 L160,254 L140,254 L140,272 Q138,278 132,278 L100,278 Q84,278 82,270 Q80,262 82,248 L74,248 Q54,242 50,222 Q48,200 50,175 Q50,150 54,136 Q46,120 46,100 Q42,72 58,48 Q90,12 150,12 Z" fill="url(#v3-sk)" stroke="#5A3E50" strokeWidth="2" strokeLinejoin="round" />
            <path d="M150,12 Q210,12 242,48 Q260,72 256,100 Q254,120 246,136 Q250,150 250,175 Q252,200 250,222 Q246,242 226,248 L218,248 Q220,262 218,270 Q216,278 200,278 L168,278 Q162,278 160,272 L160,254 L140,254 L140,272 Q138,278 132,278 L100,278 Q84,278 82,270 Q80,262 82,248 L74,248 Q54,242 50,222 Q48,200 50,175 Q50,150 54,136 Q46,120 46,100 Q42,72 58,48 Q90,12 150,12 Z" fill="url(#v3-bs)" />
            <ellipse cx="130" cy="55" rx="60" ry="50" fill="url(#v3-hg)" />

            {/* Chin/Neck Shadow */}
            <ellipse cx="150" cy="140" rx="55" ry="10" fill="rgba(50,25,38,0.08)" />
            <path d="M88,138 Q150,150 212,138" fill="none" stroke="#6E4E5E" strokeWidth="1.5" opacity="0.2" />

            {/* Shirt */}
            <path d="M52,136 Q50,148 50,160 L250,160 Q250,148 248,136 Q228,124 150,124 Q72,124 52,136 Z" fill="#1A4050" stroke="#122F3C" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M52,136 Q36,146 28,164 Q26,174 32,180 Q40,184 48,178 Q52,168 52,158 Z" fill="#1A4050" stroke="#122F3C" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M248,136 Q264,146 272,164 Q274,174 268,180 Q260,184 252,178 Q248,168 248,158 Z" fill="#1A4050" stroke="#122F3C" strokeWidth="1.2" strokeLinejoin="round" />

            {/* Overalls */}
            <path d="M54,154 Q52,172 50,194 Q48,218 52,234 Q58,244 74,248 L226,248 Q242,244 248,234 Q252,218 250,194 Q248,172 246,154 Z" fill="url(#v3-ov)" stroke="#6E5C6E" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M74,246 Q72,258 70,266 Q68,274 82,278 L132,278 Q138,278 140,272 L140,246 Z" fill="url(#v3-ov)" stroke="#6E5C6E" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M71,268 Q84,274 102,276 Q122,276 140,268" fill="none" stroke="#6E5C6E" strokeWidth="1" />
            <path d="M160,246 L160,272 Q162,278 170,278 L218,278 Q232,274 230,266 Q228,258 226,246 Z" fill="url(#v3-ov)" stroke="#6E5C6E" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M161,268 Q178,274 196,276 Q216,276 229,268" fill="none" stroke="#6E5C6E" strokeWidth="1" />
            <path d="M90,154 Q88,142 90,134 Q92,126 100,124 L118,124 Q126,126 124,134 Q122,142 120,154" fill="#9A8490" stroke="#6E5C6E" strokeWidth="0.8" strokeLinejoin="round" />
            <path d="M180,154 Q178,142 180,134 Q182,126 190,124 L208,124 Q216,126 214,134 Q212,142 210,154" fill="#9A8490" stroke="#6E5C6E" strokeWidth="0.8" strokeLinejoin="round" />
            <circle cx="90" cy="156" r="4.5" fill="#DCAA3C" stroke="#C09028" strokeWidth="0.5" />
            <circle cx="210" cy="156" r="4.5" fill="#DCAA3C" stroke="#C09028" strokeWidth="0.5" />
            <path d="M128,178 L128,210 Q128,218 136,220 L164,220 Q172,218 172,210 L172,178 Q172,176 164,176 L136,176 Q128,176 128,178 Z" fill="#7EAD8A" stroke="#5A8A6A" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M50,218 Q52,234 64,242 L78,242 Q80,234 80,218 Q66,218 50,218 Z" fill="#7EAD8A" stroke="#5A8A6A" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M250,218 Q248,234 236,242 L222,242 Q220,234 220,218 Q234,218 250,218 Z" fill="#7EAD8A" stroke="#5A8A6A" strokeWidth="1.2" strokeLinejoin="round" />
            <line x1="150" y1="224" x2="150" y2="284" stroke="#6E5C6E" strokeWidth="0.8" />

            {/* Feet */}
            <path d="M68,276 Q68,284 92,286 L142,286 Q144,282 142,276" fill="#88607A" stroke="#5A3E50" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M158,276 Q156,280 158,284 L210,286 Q234,284 234,276" fill="#88607A" stroke="#5A3E50" strokeWidth="1.5" strokeLinejoin="round" />

            {/* ═══════ DYNAMIC FACE ═══════ */}

            {/* Eyebrows */}
            <path d={config.eyebrowL} fill="none" stroke="#2A1820" strokeWidth="6" strokeLinecap="round" />
            <path d={config.eyebrowR} fill="none" stroke="#2A1820" strokeWidth="6" strokeLinecap="round" />

            {/* Left eye */}
            <g mask="url(#v3-lid-L)">
                <ellipse cx="116" cy="80" rx="15" ry="17" fill="#FEFCF8" stroke="#4E3545" strokeWidth="1.5" />
                <circle cx={config.pupilL.cx} cy={config.pupilL.cy} r="8" fill="#3A2228" />
                <circle cx={config.pupilL.cx + 3} cy={config.pupilL.cy - 5} r="2.5" fill="#FFF" />
                <circle cx={config.pupilL.cx - 3} cy={config.pupilL.cy + 3} r="1.2" fill="rgba(255,255,255,0.35)" />
            </g>

            {/* Right eye */}
            <g mask="url(#v3-lid-R)">
                <ellipse cx="184" cy="80" rx="15" ry="17" fill="#FEFCF8" stroke="#4E3545" strokeWidth="1.5" />
                <circle cx={config.pupilR.cx} cy={config.pupilR.cy} r="8" fill="#3A2228" />
                <circle cx={config.pupilR.cx + 3} cy={config.pupilR.cy - 5} r="2.5" fill="#FFF" />
                <circle cx={config.pupilR.cx - 3} cy={config.pupilR.cy + 3} r="1.2" fill="rgba(255,255,255,0.35)" />
            </g>

            {/* Mouth */}
            <path d={config.mouth} fill="none" stroke="#5C3B4A" strokeWidth="2" strokeLinecap="round" />
            {expression === 'dummy' && (
                <>
                    <path d="M140,106 Q142,108 140,110" fill="none" stroke="#5C3B4A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
                    <path d="M160,106 Q158,108 160,110" fill="none" stroke="#5C3B4A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
                </>
            )}

            <style>{`@keyframes v3-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}svg{animation:v3-b infinite ease-in-out}`}</style>
        </svg>
    );
};

export default DummyCharacterV3;
