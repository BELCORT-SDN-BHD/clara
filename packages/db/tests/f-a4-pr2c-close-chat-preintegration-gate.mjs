// Preintegration gate for the UNNUMBERED F-A4 PR-2c close-chat migration. The package-wide suite
// preloads this file so older frontier databases skip loudly. A focused battery invocation does
// not preload it and therefore fails closed when the exact live catalog surface is absent.
process.env.CLARA_ALLOW_MISSING_F_A4_PR2C_CLOSE_CHAT = "1";
