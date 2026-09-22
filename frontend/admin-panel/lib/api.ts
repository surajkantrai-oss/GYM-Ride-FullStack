"use client";
import { createGymRideApi } from "@gymride/api-client";
import { createWebApi } from "@gymride/web-ui";
export const api = createWebApi("admin");
export const domainApi = createGymRideApi(api);
export const json = (value: unknown) => JSON.stringify(value);
