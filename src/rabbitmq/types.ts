export interface PRJob {

    repository: string;

    cloneUrl: string;

    commit: string;

    branch: string;

    prNumber: number;

    provider: "github" | "gitlab";

    timestamp: string;

}