"use client";
import { createGymRideApi } from "@gymride/api-client";
import { createWebApi } from "@gymride/web-ui";
export const api = createWebApi("partner");
export const domainApi = createGymRideApi(api);
export const json = (value: unknown) => JSON.stringify(value);
export const gymImageUrl = (imageId: string) =>
  `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/media/gym-images/${imageId}`;
