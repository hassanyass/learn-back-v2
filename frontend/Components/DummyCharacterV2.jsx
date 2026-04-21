import React from 'react';

/**
 * DummyCharacterV2 — Complete organic rework
 * Smooth bean-shaped blob, soft 3D shading, rounded clothing,
 * small expressive eyes, dummy/goofy look, muted palette.
 */
const DummyCharacterV2 = ({ width = 300, height = 300, className, style }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width={width} height={height} className={className} style={style}>
            <defs>
                {/* Ground shadow */}
                <radialGradient id="v2-gs" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(0,0,0,0.16)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>

                {/* Skin — soft warm mauve with highlight */}
                <radialGradient id="v2-sk" cx="40%" cy="25%" r="65%">
                    <stop offset="0%" stopColor="#C49AAC" />
                    <stop offset="40%" stopColor="#A67A8E" />
                    <stop offset="100%" stopColor="#8B6078" />
                </radialGradient>

                {/* Body side shadow — gives 3D roundness */}
                <linearGradient id="v2-bs" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(40,18,30,0.12)" />
                    <stop offset="18%" stopColor="rgba(40,18,30,0)" />
                    <stop offset="82%" stopColor="rgba(40,18,30,0)" />
                    <stop offset="100%" stopColor="rgba(40,18,30,0.12)" />
                </linearGradient>

                {/* Head highlight — subtle top-left glow */}
                <radialGradient id="v2-hg" cx="35%" cy="20%" r="40%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>

                {/* Overalls — softer, slightly lighter than skin */}
                <linearGradient id="v2-ov" x1=".5" y1="0" x2=".5" y2="1">
                    <stop offset="0%" stopColor="#A48B9A" />
                    <stop offset="100%" stopColor="#957D8C" />
                </linearGradient>

                {/* Arm skin */}
                <linearGradient id="v2-ar" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#AB8094" />
                    <stop offset="100%" stopColor="#916980" />
                </linearGradient>

                {/* Arm shadow overlay */}
                <linearGradient id="v2-as" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(40,18,30,0.08)" />
                    <stop offset="100%" stopColor="rgba(40,18,30,0.15)" />
                </linearGradient>
            </defs>

            {/* Ground shadow */}
            <ellipse cx="150" cy="288" rx="72" ry="7" fill="url(#v2-gs)" />

            {/* ===== LEFT ARM — organic curve with thumb ===== */}
            <path d="M52,148 Q30,165 24,200 Q20,230 26,242 Q28,248 34,248 Q40,248 44,244 Q48,240 50,220 Q50,186 52,148 Z"
                fill="url(#v2-ar)" stroke="#5A3E50" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M52,148 Q30,165 24,200 Q20,230 26,242 Q28,248 34,248 Q40,248 44,244 Q48,240 50,220 Q50,186 52,148 Z"
                fill="url(#v2-as)" />

            {/* ===== RIGHT ARM — with thumb ===== */}
            <path d="M248,148 Q270,165 276,200 Q280,230 274,242 Q272,248 266,248 Q260,248 256,244 Q252,240 250,220 Q250,186 248,148 Z"
                fill="url(#v2-ar)" stroke="#5A3E50" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M248,148 Q270,165 276,200 Q280,230 274,242 Q272,248 266,248 Q260,248 256,244 Q252,240 250,220 Q250,186 248,148 Z"
                fill="url(#v2-as)" />

            {/* ===== BODY — belly aligned with overalls width ===== */}
            <path d="M150,12
                Q210,12 242,48
                Q260,72 256,100
                Q254,120 246,136
                Q250,150 250,175
                Q252,200 250,222
                Q246,242 226,248
                L218,248
                Q220,262 218,270
                Q216,278 200,278
                L168,278
                Q162,278 160,272
                L160,254
                L140,254
                L140,272
                Q138,278 132,278
                L100,278
                Q84,278 82,270
                Q80,262 82,248
                L74,248
                Q54,242 50,222
                Q48,200 50,175
                Q50,150 54,136
                Q46,120 46,100
                Q42,72 58,48
                Q90,12 150,12 Z"
                fill="url(#v2-sk)" stroke="#5A3E50" strokeWidth="2" strokeLinejoin="round" />

            {/* Body side shadow */}
            <path d="M150,12
                Q210,12 242,48
                Q260,72 256,100
                Q254,120 246,136
                Q250,150 250,175
                Q252,200 250,222
                Q246,242 226,248
                L218,248
                Q220,262 218,270
                Q216,278 200,278
                L168,278
                Q162,278 160,272
                L160,254
                L140,254
                L140,272
                Q138,278 132,278
                L100,278
                Q84,278 82,270
                Q80,262 82,248
                L74,248
                Q54,242 50,222
                Q48,200 50,175
                Q50,150 54,136
                Q46,120 46,100
                Q42,72 58,48
                Q90,12 150,12 Z"
                fill="url(#v2-bs)" />

            {/* Head highlight — soft glow */}
            <ellipse cx="130" cy="55" rx="60" ry="50" fill="url(#v2-hg)" />

            {/* Chin shadow — soft depth */}
            <ellipse cx="150" cy="140" rx="55" ry="10" fill="rgba(50,25,38,0.08)" />
            <path d="M88,138 Q150,150 212,138" fill="none" stroke="#6E4E5E" strokeWidth="1.5" opacity="0.2" />

            {/* ===== T-SHIRT — narrow band ===== */}
            <path d="M52,136
                Q50,148 50,160
                L250,160
                Q250,148 248,136
                Q228,124 150,124
                Q72,124 52,136 Z"
                fill="#1A4050" stroke="#122F3C" strokeWidth="1.2" strokeLinejoin="round" />
            {/* Left sleeve — soft, drooping */}
            <path d="M52,136 Q36,146 28,164 Q26,174 32,180 Q40,184 48,178 Q52,168 52,158 Z"
                fill="#1A4050" stroke="#122F3C" strokeWidth="1.2" strokeLinejoin="round" />
            {/* Right sleeve */}
            <path d="M248,136 Q264,146 272,164 Q274,174 268,180 Q260,184 252,178 Q248,168 248,158 Z"
                fill="#1A4050" stroke="#122F3C" strokeWidth="1.2" strokeLinejoin="round" />

            {/* ===== OVERALLS — aligned with body width ===== */}
            <path d="M54,154
                Q52,172 50,194
                Q48,218 52,234
                Q58,244 74,248
                L226,248
                Q242,244 248,234
                Q252,218 250,194
                Q248,172 246,154 Z"
                fill="url(#v2-ov)" stroke="#6E5C6E" strokeWidth="1.2" strokeLinejoin="round" />

            {/* Left leg */}
            <path d="M74,246 Q72,258 70,266 Q68,274 82,278 L132,278 Q138,278 140,272 L140,246 Z"
                fill="url(#v2-ov)" stroke="#6E5C6E" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M71,268 Q84,274 102,276 Q122,276 140,268"
                fill="none" stroke="#6E5C6E" strokeWidth="1" />

            {/* Right leg */}
            <path d="M160,246 L160,272 Q162,278 170,278 L218,278 Q232,274 230,266 Q228,258 226,246 Z"
                fill="url(#v2-ov)" stroke="#6E5C6E" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M161,268 Q178,274 196,276 Q216,276 229,268"
                fill="none" stroke="#6E5C6E" strokeWidth="1" />

            {/* Straps — wider, organic curves */}
            <path d="M90,154 Q88,142 90,134 Q92,126 100,124 L118,124 Q126,126 124,134 Q122,142 120,154"
                fill="#9A8490" stroke="#6E5C6E" strokeWidth="0.8" strokeLinejoin="round" />
            <path d="M180,154 Q178,142 180,134 Q182,126 190,124 L208,124 Q216,126 214,134 Q212,142 210,154"
                fill="#9A8490" stroke="#6E5C6E" strokeWidth="0.8" strokeLinejoin="round" />

            {/* Buttons — golden */}
            <circle cx="90" cy="156" r="4.5" fill="#DCAA3C" stroke="#C09028" strokeWidth="0.5" />
            <circle cx="210" cy="156" r="4.5" fill="#DCAA3C" stroke="#C09028" strokeWidth="0.5" />

            {/* Center pocket — ROUNDED, clear outline */}
            <path d="M128,178 L128,210 Q128,218 136,220 L164,220 Q172,218 172,210 L172,178 Q172,176 164,176 L136,176 Q128,176 128,178 Z"
                fill="#7EAD8A" stroke="#5A8A6A" strokeWidth="1.2" strokeLinejoin="round" />

            {/* Side pockets — smaller, rounded */}
            <path d="M50,218 Q52,234 64,242 L78,242 Q80,234 80,218 Q66,218 50,218 Z"
                fill="#7EAD8A" stroke="#5A8A6A" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M250,218 Q248,234 236,242 L222,242 Q220,234 220,218 Q234,218 250,218 Z"
                fill="#7EAD8A" stroke="#5A8A6A" strokeWidth="1.2" strokeLinejoin="round" />

            {/* Center seam */}
            <line x1="150" y1="224" x2="150" y2="284" stroke="#6E5C6E" strokeWidth="0.8" />

            {/* FEET — rounded boots */}
            {/* Feet — flatter bottom for stability */}
            <path d="M68,276 Q68,284 92,286 L142,286 Q144,282 142,276"
                fill="#88607A" stroke="#5A3E50" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M158,276 Q156,280 158,284 L210,286 Q234,284 234,276"
                fill="#88607A" stroke="#5A3E50" strokeWidth="1.5" strokeLinejoin="round" />

            {/* ═══════ FACE — maximum "dummy" cuteness ═══════ */}

            {/* Eyebrows — higher, smaller, floating */}
            <path d="M106,48 Q116,40 126,46" fill="none" stroke="#2A1820" strokeWidth="6" strokeLinecap="round" />
            <path d="M174,46 Q184,40 194,48" fill="none" stroke="#2A1820" strokeWidth="6" strokeLinecap="round" />

            {/* Left eye — further apart, looking slightly in */}
            <ellipse cx="116" cy="80" rx="15" ry="17" fill="#FEFCF8" stroke="#4E3545" strokeWidth="1.5" />
            <circle cx="120" cy="82" r="8" fill="#3A2228" />
            <circle cx="123" cy="77" r="2.5" fill="#FFF" />
            <circle cx="117" cy="85" r="1.2" fill="rgba(255,255,255,0.35)" />

            {/* Right eye — further apart, looking slightly in */}
            <ellipse cx="184" cy="80" rx="15" ry="17" fill="#FEFCF8" stroke="#4E3545" strokeWidth="1.5" />
            <circle cx="180" cy="82" r="8" fill="#3A2228" />
            <circle cx="183" cy="77" r="2.5" fill="#FFF" />
            <circle cx="177" cy="85" r="1.2" fill="rgba(255,255,255,0.35)" />

            {/* Mouth — tiny confused smile */}
            <path d="M142,108 Q150,114 158,108" fill="none" stroke="#5C3B4A" strokeWidth="2" strokeLinecap="round" />
            <path d="M140,106 Q142,108 140,110" fill="none" stroke="#5C3B4A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            <path d="M160,106 Q158,108 160,110" fill="none" stroke="#5C3B4A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />

            <style>{`@keyframes v2-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}svg{animation:v2-b 4s ease-in-out infinite}`}</style>
        </svg>
    );
};

export default DummyCharacterV2;
