"use client";
import { FinanceWorkspace } from "@gymride/web-ui/finance";
import { api } from "@/lib/api";
export default function FinancePage() {
  return <FinanceWorkspace api={api} role="partner" />;
}
