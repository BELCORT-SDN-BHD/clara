// Preintegration gate for 0159_f_a4_pr_2c_close_chat_lane.sql, the F-A4 PR-2c close-chat
// migration (number claimed at merge prep 2026-09-01, one past the live frontier 0158). The
// package-wide suite
// preloads this file so older frontier databases skip loudly. A focused battery invocation does
// not preload it and therefore fails closed when the exact live catalog surface is absent.
process.env.CLARA_ALLOW_MISSING_F_A4_PR2C_CLOSE_CHAT = "1";
