// Pure business logic. No I/O, no framework imports: this runs in the
// browser (offline) and on the server. Modules arrive in Phase 1.

/** 1 TND = 1000 millimes. Money is always an integer number of millimes. */
export const MILLIMES_PER_DINAR = 1000;

/** All dates and cycles are computed in this time zone. */
export const APP_TIME_ZONE = "Africa/Tunis";
