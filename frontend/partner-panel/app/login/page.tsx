"use client";
import { LoginScreen } from "@gymride/web-ui";
import { api } from "@/lib/api";
export default function LoginPage() {
  return <LoginScreen appName="Partner" api={api} />;
}
