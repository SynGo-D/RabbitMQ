export interface PRJob {

    repository: string;

    cloneUrl: string;

    commit: string;

    branch: string;

    prNumber: number;

    provider: "github" | "gitlab";

    timestamp: string;

}

/**
 * Travels on ESLINT_QUEUE, PYLINT_QUEUE and RADON_QUEUE.
 *
 * Published by the Worker Service once it has cloned the repo and
 * figured out which linter should analyse it.
 */
export interface LintJob {

    repository: string;

    commit: string;

    prNumber: number;

    tool: "eslint" | "pylint" | "radon";

    // Where the repo was cloned to on disk, so the Analysis Engine
    // knows which folder to run the tool against.
    repoPath: string;

}

/**
 * Travels on RESULT_QUEUE.
 *
 * Published by an Analysis Engine (ESLint / PyLint / Radon) once it
 * has finished running its tool and parsed the output.
 */
export interface LintResult {

    repository: string;

    commit: string;

    prNumber: number;

    tool: "eslint" | "pylint" | "radon";

    // Each tool returns a differently shaped JSON report, so we
    // keep this loose on purpose instead of forcing one strict
    // shape on every tool.
    findings: unknown;

}

/**
 * Travels on DEBT_QUEUE.
 *
 * Published by the Result Collector Service once it has gathered
 * the results from all three linters for a given pull request.
 */
export interface DebtCalculationJob {

    repository: string;

    commit: string;

    prNumber: number;

    // The combined raw output from ESLint, PyLint and Radon.
    results: LintResult[];

}

/**
 * Travels on NOTIFICATION_QUEUE.
 *
 * Published by the Technical Debt Calculation Service when
 * something needs to be pushed to the mobile app, e.g. a build
 * failure or a critical technical debt issue.
 */
export interface NotificationPayload {

    repository: string;

    prNumber: number;

    // Short, human-readable text shown in the push notification.
    message: string;

    severity: "info" | "warning" | "critical";

}
