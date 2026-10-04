import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SuncrestDemo } from "@/components/suncrest-demo";

export const metadata: Metadata = {
  title: "Suncrest College | Meet your AI receptionist",
  description: "Ask about Suncrest programs, admissions, and student life by voice or chat.",
  robots: { index: false, follow: false },
};

export default function SuncrestDemoPage() {
  const widgetKey = process.env.SUNCREST_DEMO_WIDGET_KEY;
  if (!widgetKey || process.env.MANAGED_CLIENT_DEPLOYMENT !== "true") notFound();
  return <SuncrestDemo widgetKey={widgetKey} />;
}
