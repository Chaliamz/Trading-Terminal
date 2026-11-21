"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUiStore, type RightTab } from "@/store/ui-store";
import { MarketInfo } from "./market-info";
import { OrderTicket } from "./order-ticket";
import { RiskCalculator } from "./risk-calculator";
import { StructurePanel } from "./structure-panel";

export function RightPanel() {
  const tab = useUiStore((s) => s.rightTab);
  const setTab = useUiStore((s) => s.setRightTab);
  return (
    <div className="flex h-full flex-col">
      <MarketInfo />
      <Tabs value={tab} onValueChange={(v) => setTab(v as RightTab)} className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="order">Order</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
        </TabsList>
        <TabsContent value="order" className="overflow-y-auto">
          <OrderTicket />
        </TabsContent>
        <TabsContent value="risk" className="overflow-y-auto">
          <RiskCalculator />
        </TabsContent>
        <TabsContent value="structure" className="overflow-y-auto">
          <StructurePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
