/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as batches from "../batches.js";
import type * as datasets from "../datasets.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_batchNames from "../lib/batchNames.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_datasetNames from "../lib/datasetNames.js";
import type * as lib_runs from "../lib/runs.js";
import type * as lib_schedule_clip_workers from "../lib/schedule_clip_workers.js";
import type * as logs from "../logs.js";
import type * as process from "../process.js";
import type * as processActions from "../processActions.js";
import type * as settings from "../settings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  batches: typeof batches;
  datasets: typeof datasets;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/auth": typeof lib_auth;
  "lib/batchNames": typeof lib_batchNames;
  "lib/constants": typeof lib_constants;
  "lib/datasetNames": typeof lib_datasetNames;
  "lib/runs": typeof lib_runs;
  "lib/schedule_clip_workers": typeof lib_schedule_clip_workers;
  logs: typeof logs;
  process: typeof process;
  processActions: typeof processActions;
  settings: typeof settings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
