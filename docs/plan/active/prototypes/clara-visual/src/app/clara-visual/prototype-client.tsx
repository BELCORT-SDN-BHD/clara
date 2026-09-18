"use client";

import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  FileText,
  Home,
  Landmark,
  MessageSquareText,
  Play,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { NativeClaraChat } from "./native-clara-chat";

type Variant = "A" | "B" | "C";
type Surface = "home" | "work" | "documents" | "accounting";
type WorkStatus = "needs_you" | "processing" | "complete";

type WorkItem = {
  id: string;
  title: string;
  summary: string;
  status: WorkStatus;
  progress: string;
};

const VARIANTS: Variant[] = ["A", "B", "C"];
const PERIOD = "2026 年 8 月";
const FRESHNESS = "更新于 2026-09-08 09:30";

const INITIAL_WORK: WorkItem[] = [
  {
    id: "WORK-2409",
    title: "处理 3 份采购文件",
    summary: "2 份已完成；Maju Industrial 账单需要确认供应商。",
    status: "needs_you",
    progress: "已完成 2 / 3",
  },
  {
    id: "WORK-2411",
    title: "记录包装设备购置",
    summary: "购置分录已完成；折旧起始日仍需确认。",
    status: "needs_you",
    progress: "购置已入账 · 折旧待确认",
  },
  {
    id: "WORK-2412",
    title: "完成 2026 年 8 月月结",
    summary: "银行匹配正在复核，完成后进入关账检查。",
    status: "processing",
    progress: "正在检查 2 项",
  },
  {
    id: "WORK-2408",
    title: "核对 Apex Office Supplies 账单",
    summary: "供应商、税额与应付账款分录已核对。",
    status: "complete",
    progress: "2026-09-07 完成",
  },
];

const metrics = [
  ["现金账面余额", "RM 284,980.00", "连续客户总账 · 截至 8 月 31 日"],
  ["应收未结", "RM 92,640.00", "应收账龄 · 8 月 31 日"],
  ["应付未结", "RM 71,250.00", "应付账龄 · 8 月 31 日"],
  ["本期利润", "RM 78,380.00", "收入 RM 436,800 · 费用 RM 358,420"],
];

const periodTrend = [
  ["3 月", 388200, 324800],
  ["4 月", 402500, 337200],
  ["5 月", 419100, 345600],
  ["6 月", 410800, 352900],
  ["7 月", 428600, 350100],
  ["8 月", 436800, 358420],
] as const;

const bookCashTrend = [
  { month: "3 月", balance: 205100 },
  { month: "4 月", balance: 218400 },
  { month: "5 月", balance: 231900 },
  { month: "6 月", balance: 225750 },
  { month: "7 月", balance: 267330 },
  { month: "8 月", balance: 284980 },
];

const outstandingByDueDate = [
  { bucket: "未到期", receivable: 36400, payable: 30800, receivableCount: 8, payableCount: 7 },
  { bucket: "逾期 1–30", receivable: 28240, payable: 21150, receivableCount: 6, payableCount: 5 },
  { bucket: "逾期 31–60", receivable: 12400, payable: 9600, receivableCount: 3, payableCount: 2 },
  { bucket: "逾期 61–90", receivable: 7200, payable: 4800, receivableCount: 2, payableCount: 2 },
  { bucket: "逾期 90+", receivable: 5400, payable: 2900, receivableCount: 1, payableCount: 1 },
  { bucket: "无到期日", receivable: 3000, payable: 2000, receivableCount: 1, payableCount: 1 },
];

const incomeExpenseData = periodTrend.map(([month, income, expense]) => ({ month, income, expense }));

const journals = [
  ["JE-1042", "Apex Office Supplies 账单", "2026-08-18", "RM 13,580.00", "已过账"],
  ["JE-1049", "Maju Industrial 账单", "2026-08-28", "RM 9,667.20", "待确认"],
  ["JE-1051", "Westport 运费收据", "2026-08-30", "RM 1,280.00", "已过账"],
];

const nav = [
  ["home", "首页", Home],
  ["work", "工作", Play],
  ["documents", "文件", FileText],
  ["accounting", "会计", BookOpen],
] as const;

function statusCopy(status: WorkStatus) {
  if (status === "needs_you") return { label: "需要你", className: "border-warning/30 bg-warning/10 text-warning" };
  if (status === "processing") return { label: "处理中", className: "border-info/30 bg-info/10 text-info" };
  return { label: "已完成", className: "border-success/30 bg-success/10 text-success" };
}

function StatusBadge({ status }: { status: WorkStatus }) {
  const copy = statusCopy(status);
  return <Badge variant="outline" className={copy.className}>{copy.label}</Badge>;
}

function PrototypeMark() {
  return (
    <Badge variant="secondary" className="border border-border bg-background/95 text-foreground shadow-sm">
      视觉原型 · 合成数据
    </Badge>
  );
}

function PrototypeSidebar({ surface, setSurface, needsYou }: {
  surface: Surface;
  setSurface: (surface: Surface) => void;
  needsYou: number;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [accountingOpen, setAccountingOpen] = useState(surface === "accounting");
  useEffect(() => {
    if (surface === "accounting") setAccountingOpen(true);
  }, [surface]);
  const go = (next: Surface) => {
    setSurface(next);
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2 px-2 py-1 font-heading text-lg font-semibold"><span className="grid size-7 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">C</span>Clara</div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="h-auto py-2" />}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-accent"><Building2 className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">青禾贸易有限公司</span><span className="block truncate text-xs text-muted-foreground">客户账簿 · 合成数据</span></span>
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>当前客户</DropdownMenuLabel>
                  <DropdownMenuItem aria-current="true"><Check />青禾贸易有限公司</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>客户</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.filter(([key]) => key !== "accounting").map(([key, label, Icon]) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton isActive={surface === key} tooltip={label} render={<a href={`#${key}`} aria-current={surface === key ? "page" : undefined} onClick={(event) => { event.preventDefault(); go(key); }} />}>
                    <Icon /><span>{label}</span>
                  </SidebarMenuButton>
                  {key === "work" && needsYou > 0 && <SidebarMenuBadge>{needsYou}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
              <Collapsible open={accountingOpen} onOpenChange={setAccountingOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger render={<SidebarMenuButton isActive={surface === "accounting"} tooltip="会计" />}>
                    <BookOpen /><span>会计</span><ChevronDown className="ml-auto transition-transform group-data-open:rotate-180 motion-reduce:transition-none" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {["日记账", "银行", "应收与应付", "资产", "计划", "科目", "关账"].map((item) => (
                        <SidebarMenuSubItem key={item}>
                          <SidebarMenuSubButton
                            isActive={item === "日记账" && surface === "accounting"}
                            aria-disabled={item !== "日记账"}
                            className={item !== "日记账" ? "pointer-events-none opacity-50" : undefined}
                            render={<a href={item === "日记账" ? "#accounting" : `#${item}`} aria-current={item === "日记账" && surface === "accounting" ? "page" : undefined} onClick={(event) => { event.preventDefault(); if (item === "日记账") go("accounting"); }} />}
                          >
                            <span>{item}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              <SidebarMenuItem><SidebarMenuButton disabled><Landmark /><span>知识</span></SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton disabled><FileText /><span>报告</span></SidebarMenuButton></SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="px-4 py-3 text-xs leading-5 text-muted-foreground">Clara 会计事务所<br />吉隆坡</SidebarFooter>
    </Sidebar>
  );
}

function ScopeHeader({ surface, openRail, railTriggerRef, variant }: {
  surface: Surface;
  openRail: () => void;
  railTriggerRef: RefObject<HTMLButtonElement | null>;
  variant: Variant;
}) {
  const titles: Record<Surface, string> = { home: "客户首页", work: "工作", documents: "文件", accounting: "会计" };
  return (
    <header className={cn(
      "z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 sm:px-6",
      variant === "A" ? "sticky top-0 bg-background/88 supports-backdrop-filter:backdrop-blur-md" : "bg-background",
    )}>
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger aria-label="切换客户导航" />
        <div className="min-w-0">
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList className="flex-nowrap text-xs"><BreadcrumbItem className="hidden sm:inline-flex">青禾贸易有限公司</BreadcrumbItem><BreadcrumbSeparator className="hidden sm:list-item" /><BreadcrumbItem><BreadcrumbPage className="truncate">{titles[surface]}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList>
          </Breadcrumb>
          <h1 className="truncate font-heading text-lg font-medium text-foreground">{titles[surface]}</h1>
          <p className="truncate text-[11px] text-muted-foreground sm:hidden">青禾贸易 · {PERIOD}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value="2026-08">
          <SelectTrigger size="sm" aria-label="会计期间" className="hidden sm:flex"><SelectValue>2026 年 8 月</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="2026-08">2026 年 8 月</SelectItem></SelectGroup></SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="搜索" disabled>
          <Search />
        </Button>
        <Button ref={railTriggerRef} variant="outline" onClick={openRail} aria-label="问 Clara">
          <Sparkles data-icon="inline-start" />
          <span className="hidden sm:inline">问 Clara</span>
        </Button>
      </div>
    </header>
  );
}

function WorkList({ items, selected, select, compact = false }: {
  items: WorkItem[];
  selected: string;
  select: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => select(item.id)}
          aria-current={selected === item.id ? "true" : undefined}
          className={cn(
            "group w-full px-4 py-4 text-left outline-none transition-colors motion-reduce:transition-none hover:bg-muted/45 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70",
            selected === item.id && "bg-muted/70",
            compact && "py-3",
          )}
        >
          <div className="mb-1 flex items-start justify-between gap-3">
            <span className="font-medium text-foreground">{item.title}</span>
            <StatusBadge status={item.status} />
          </div>
          {!compact && <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{item.summary}</p>}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.id}</span><span>{item.progress}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function QuestionBlock({ answered, answer }: { answered: boolean; answer: () => void }) {
  return (
    <section aria-labelledby="question-title" className="rounded-lg border border-border bg-surface-subtle p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Q-UP-002 · WORK-2409</div>
          <h3 id="question-title" className="mt-1 font-heading text-base font-medium">这份账单属于哪个供应商？</h3>
        </div>
        <Badge variant={answered ? "secondary" : "outline"}>{answered ? "已回答" : "等待回答"}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">文件只有简称 “Maju Industrial”，没有注册号或银行资料。Clara 无法用当前客户知识确认它与现有主体是同一方；选择后会继续处理同一项工作。</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant={answered ? "secondary" : "outline"} onClick={answer} disabled={answered}>
          {answered && <Check data-icon="inline-start" />}
          Maju Industrial Sdn. Bhd.
        </Button>
        <Button variant="ghost" disabled>建立新的供应商</Button>
      </div>
    </section>
  );
}

function WorkResult({ item, answered }: { item: WorkItem; answered: boolean }) {
  if (item.id === "WORK-2409") {
    return answered ? (
      <section className="rounded-lg border border-info/25 bg-info/5 p-4"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-info/10 text-info"><Clock3 className="size-4" /></span><div><div className="font-medium">供应商已确认，处理继续进行</div><div className="mt-1 text-sm text-muted-foreground">Maju Industrial Sdn. Bhd. · 已完成 2 / 3 份文件</div></div></div></section>
    ) : (
      <p className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">回答上方问题后，处理结果会继续保留在这项工作中。</p>
    );
  }
  if (item.id === "WORK-2411") return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-success/10 text-success"><Check className="size-4" /></span><div><div className="font-medium">购置分录已完成</div><div className="text-sm text-muted-foreground">包装设备 · RM 48,000.00 · 2026-08-24</div></div></div>
      <div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-warning/10 text-warning"><Clock3 className="size-4" /></span><div><div className="font-medium">折旧等待确认</div><div className="text-sm text-muted-foreground">需要折旧起始日与预计使用年限。</div></div></div>
    </section>
  );
  if (item.status === "complete") return (
    <section className="rounded-lg border border-success/25 bg-success/5 p-4"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-success/10 text-success"><Check className="size-4" /></span><div><div className="font-medium">核对结果已保留</div><div className="mt-1 text-sm text-muted-foreground">供应商、税额与应付账款分录已于 2026-09-07 完成。</div></div></div></section>
  );
  return <section className="grid gap-3 sm:grid-cols-2">{["银行对账差异复核", "未结文件完整性检查"].map((step) => <div key={step} className="rounded-lg border border-border p-4"><Clock3 className="mb-3 size-4 text-info" /><div className="font-medium">{step}</div><div className="mt-1 text-sm text-muted-foreground">Clara 正在检查</div></div>)}</section>;
}

function WorkSources({ item }: { item: WorkItem }) {
  const sources = item.id === "WORK-2409"
    ? [["Maju_Bill_1488.pdf", "原始账单", "2026-08-28"], ["客户知识中的主体记录", "客户记录", "2026-08-31"]]
    : item.id === "WORK-2411"
      ? [["Asset_Invoice_0824.pdf", "采购文件", "2026-08-24"], ["固定资产清单", "客户记录", "2026-08-31"]]
      : item.id === "WORK-2412"
        ? [["Maybank_Aug_2026.pdf", "银行月结单", "2026-08-31"], ["8 月未结文件清单", "客户记录", "2026-09-08"]]
        : [["Apex_Office_0826.pdf", "原始账单", "2026-08-18"], ["JE-1042", "日记账", "2026-09-07"]];
  return <Table aria-label={`${item.id} 来源`} className="text-sm"><TableHeader><TableRow><TableHead>来源</TableHead><TableHead>类型</TableHead><TableHead className="text-right">日期</TableHead></TableRow></TableHeader><TableBody>{sources.map(([name, type, date]) => <TableRow key={name}><TableCell className="font-medium">{name}</TableCell><TableCell>{type}</TableCell><TableCell className="text-right tabular-nums">{date}</TableCell></TableRow>)}</TableBody></Table>;
}

function WorkActivity({ item, answered }: { item: WorkItem; answered: boolean }) {
  const events = item.id === "WORK-2409" && answered
    ? [["09:42", "供应商回答已保存"], ["09:42", "第 3 份采购文件继续处理"], ["09:30", "Clara 提出供应商问题"]]
    : [["09:30", item.status === "complete" ? "核对结果已完成并保留" : "当前状态已更新"], ["09:18", "来源资料已关联到工作"]];
  return <ol className="space-y-3">{events.map(([time, label]) => <li key={`${time}-${label}`} className="flex gap-3 border-b border-border pb-3 last:border-b-0"><span className="w-12 shrink-0 tabular-nums text-xs text-muted-foreground">{time}</span><span className="text-sm">{label}</span></li>)}</ol>;
}

function WorkDetail({ item, answered, answer, openRail, headingRef }: {
  item: WorkItem;
  answered: boolean;
  answer: () => void;
  openRail: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const shownStatus = item.id === "WORK-2409" && answered ? "processing" : item.status;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{item.id}</div>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-heading text-2xl font-medium tracking-tight">{item.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{answered && item.id === "WORK-2409" ? "回答已保存。Clara 正在继续处理第 3 份文件。" : item.summary}</p>
        </div>
        <StatusBadge status={shownStatus} />
      </div>
      <Separator />
      {item.id === "WORK-2409" && !answered && <QuestionBlock answered={false} answer={answer} />}
      <Tabs defaultValue="result">
        <TabsList variant="line" aria-label="工作详情视图"><TabsTrigger value="result">结果与进度</TabsTrigger><TabsTrigger value="sources">来源</TabsTrigger><TabsTrigger value="activity">活动记录</TabsTrigger></TabsList>
        <TabsContent value="result" className="pt-3"><WorkResult item={item} answered={answered} /></TabsContent>
        <TabsContent value="sources" className="pt-3"><WorkSources item={item} /></TabsContent>
        <TabsContent value="activity" className="pt-3"><WorkActivity item={item} answered={answered} /></TabsContent>
      </Tabs>
      <Button onClick={openRail}><MessageSquareText data-icon="inline-start" />在 Clara 中继续</Button>
    </div>
  );
}

function MetricGrid({ divided = false }: { divided?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]", divided ? "divide-y divide-border sm:divide-x sm:divide-y-0" : "gap-3")}>
      {metrics.map(([label, value, source]) => (
        <div key={label} className={cn("min-w-0 p-4", !divided && "rounded-lg border border-border bg-card")}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-2 whitespace-nowrap tabular-nums font-heading text-xl font-medium tracking-tight">{value}</div>
          <div className="mt-2 text-xs leading-4 text-muted-foreground">{source}</div>
        </div>
      ))}
    </div>
  );
}

const incomeExpenseConfig = {
  income: { label: "收入", color: "var(--chart-1)" },
  expense: { label: "费用", color: "var(--chart-2)" },
} satisfies ChartConfig;

const bookCashConfig = {
  balance: { label: "现金账面余额", color: "var(--chart-1)" },
} satisfies ChartConfig;

const outstandingConfig = {
  receivable: { label: "应收", color: "var(--chart-1)" },
  payable: { label: "应付", color: "var(--chart-3)" },
} satisfies ChartConfig;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function ChartDataDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group border-t border-border pt-3 text-xs">
      <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/70">查看数值表</summary>
      <div className="mt-3">{children}</div>
      <span className="sr-only">{label}</span>
    </details>
  );
}

function PeriodTrend() {
  const reduced = useReducedMotion();
  return (
    <figure aria-labelledby="period-trend-title" className="space-y-3">
      <figcaption>
        <div id="period-trend-title" className="font-heading text-base font-medium">收入与费用</div>
        <div className="mt-1 text-xs text-muted-foreground">MYR · 2026 年 3 月至 8 月 · 合成损益表 · {FRESHNESS}</div>
      </figcaption>
      <ChartContainer config={incomeExpenseConfig} className="h-52 w-full" role="img" aria-label="2026 年 3 月至 8 月收入与费用分组柱状图">
        <BarChart accessibilityLayer data={incomeExpenseData} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={42} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} animationDuration={240} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} animationDuration={240} />
        </BarChart>
      </ChartContainer>
      <ChartDataDisclosure label="六个月收入与费用数值">
        <Table aria-label="六个月收入与费用数值" className="text-xs"><TableHeader><TableRow><TableHead>月份</TableHead><TableHead className="text-right">收入</TableHead><TableHead className="text-right">费用</TableHead></TableRow></TableHeader><TableBody>{incomeExpenseData.map(({ month, income, expense }) => <TableRow key={month}><TableCell>{month}</TableCell><TableCell className="text-right tabular-nums">RM {income.toLocaleString("en-MY")}</TableCell><TableCell className="text-right tabular-nums">RM {expense.toLocaleString("en-MY")}</TableCell></TableRow>)}</TableBody></Table>
      </ChartDataDisclosure>
    </figure>
  );
}

function BookCashTrend() {
  const reduced = useReducedMotion();
  return (
    <figure aria-labelledby="cash-trend-title" className="space-y-3">
      <figcaption><div id="cash-trend-title" className="font-heading text-base font-medium">现金账面余额</div><div className="mt-1 text-xs text-muted-foreground">MYR · 各月月末 · 连续客户总账 · {FRESHNESS}</div></figcaption>
      <ChartContainer config={bookCashConfig} className="h-52 w-full" role="img" aria-label="2026 年 3 月至 8 月现金账面余额折线图">
        <LineChart accessibilityLayer data={bookCashTrend} margin={{ left: 0, right: 10, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={42} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <Line dataKey="balance" type="monotone" stroke="var(--color-balance)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-balance)" }} activeDot={{ r: 5 }} isAnimationActive={!reduced} animationDuration={240} />
        </LineChart>
      </ChartContainer>
      <ChartDataDisclosure label="六个月现金账面余额数值"><Table aria-label="六个月现金账面余额数值" className="text-xs"><TableHeader><TableRow><TableHead>月末</TableHead><TableHead className="text-right">余额</TableHead></TableRow></TableHeader><TableBody>{bookCashTrend.map(({ month, balance }) => <TableRow key={month}><TableCell>{month}</TableCell><TableCell className="text-right tabular-nums">RM {balance.toLocaleString("en-MY")}</TableCell></TableRow>)}</TableBody></Table></ChartDataDisclosure>
    </figure>
  );
}

function OutstandingDueChart() {
  const reduced = useReducedMotion();
  return (
    <figure aria-labelledby="due-chart-title" className="space-y-3">
      <figcaption><div id="due-chart-title" className="font-heading text-base font-medium">未结款项到期分布</div><div className="mt-1 text-xs text-muted-foreground">MYR · 未到期含当日 · 截至 2026-08-31 · 合成应收／应付账龄</div></figcaption>
      <ChartContainer config={outstandingConfig} className="h-52 w-full" role="img" aria-label="应收与应付未结款项按到期日分组条形图">
        <BarChart accessibilityLayer data={outstandingByDueDate} layout="vertical" margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <YAxis type="category" dataKey="bucket" tickLine={false} axisLine={false} width={76} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="receivable" fill="var(--color-receivable)" radius={[0, 3, 3, 0]} isAnimationActive={!reduced} animationDuration={240} />
          <Bar dataKey="payable" fill="var(--color-payable)" radius={[0, 3, 3, 0]} isAnimationActive={!reduced} animationDuration={240} />
        </BarChart>
      </ChartContainer>
      <ChartDataDisclosure label="应收与应付未结款项到期数值"><Table aria-label="应收与应付未结款项到期数值" className="text-xs"><TableHeader><TableRow><TableHead>到期时间</TableHead><TableHead className="text-right">应收</TableHead><TableHead className="text-right">应付</TableHead></TableRow></TableHeader><TableBody>{outstandingByDueDate.map(({ bucket, receivable, payable, receivableCount, payableCount }) => <TableRow key={bucket}><TableCell>{bucket}</TableCell><TableCell className="text-right tabular-nums">RM {receivable.toLocaleString("en-MY")} · {receivableCount} 笔</TableCell><TableCell className="text-right tabular-nums">RM {payable.toLocaleString("en-MY")} · {payableCount} 笔</TableCell></TableRow>)}</TableBody></Table></ChartDataDisclosure>
    </figure>
  );
}

function DocumentOriginal() {
  return (
    <section aria-labelledby="original-title" className="min-h-80 rounded-lg border border-border bg-muted/35 p-5">
      <div className="flex items-center justify-between gap-3">
        <div><div id="original-title" className="font-medium">Maju_Bill_1488.pdf</div><div className="text-xs text-muted-foreground">原始文件 · 第 1 页，共 1 页</div></div>
        <Badge variant="outline">PDF</Badge>
      </div>
      <div className="mx-auto mt-5 max-w-md rounded-sm border border-border bg-background p-6 shadow-sm">
        <div className="font-heading text-xl font-semibold">MAJU INDUSTRIAL</div>
        <div className="mt-1 text-xs text-muted-foreground">TAX INVOICE · MBI-1488</div>
        <div className="my-5 grid grid-cols-2 gap-3 text-xs"><div><span className="text-muted-foreground">Bill to</span><br />Qing He Trading</div><div><span className="text-muted-foreground">Date</span><br />28 Aug 2026</div></div>
        <Separator />
        <div className="space-y-3 py-4 text-sm"><div className="flex justify-between"><span>Industrial bearings</span><span className="tabular-nums">RM 8,400.00</span></div><div className="flex justify-between"><span>Delivery</span><span className="tabular-nums">RM 720.00</span></div><div className="flex justify-between text-muted-foreground"><span>SST</span><span className="tabular-nums">RM 547.20</span></div></div>
        <Separator />
        <div className="mt-4 flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">RM 9,667.20</span></div>
      </div>
    </section>
  );
}

function TypedFacts() {
  const facts = [["供应商", "Maju Industrial", "第 1 页 · 标题"], ["账单编号", "MBI-1488", "第 1 页 · 发票栏"], ["账单日期", "2026-08-28", "第 1 页 · 日期栏"], ["小计", "RM 9,120.00", "第 1 页 · 合计"], ["SST", "RM 547.20", "第 1 页 · 税额"], ["总额", "RM 9,667.20", "第 1 页 · 总计"]];
  return (
    <section aria-labelledby="facts-title" className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4"><h3 id="facts-title" className="font-heading font-medium">识别信息</h3><p className="mt-1 text-xs text-muted-foreground">每项信息保留来源位置</p></div>
      <div className="divide-y divide-border">
        {facts.map(([label, value, source]) => <div key={label} className="grid grid-cols-[7rem_1fr] gap-3 p-3 text-sm"><div className="text-muted-foreground">{label}</div><div><div className="font-medium tabular-nums">{value}</div><div className="mt-0.5 text-xs text-muted-foreground">{source}</div></div></div>)}
      </div>
    </section>
  );
}

function JournalTable({ compact = false }: { compact?: boolean }) {
  return (
    <Table aria-label="2026 年 8 月日记账条目" className={cn(compact && "text-xs")}>
      <TableHeader><TableRow><TableHead>编号</TableHead><TableHead>说明</TableHead><TableHead>日期</TableHead><TableHead className="text-right">金额</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
      <TableBody>{journals.map(([id, description, date, amount, state]) => <TableRow key={id}><TableCell className="font-medium">{id}</TableCell><TableCell>{description}</TableCell><TableCell className="tabular-nums">{date}</TableCell><TableCell className="text-right tabular-nums">{amount}</TableCell><TableCell><Badge variant={state === "已过账" ? "secondary" : "outline"}>{state}</Badge></TableCell></TableRow>)}</TableBody>
    </Table>
  );
}

function DraftEntryTable() {
  const lines = [["5100 · 采购成本（含账单税额）", "RM 9,667.20", "—"], ["2100 · 应付账款", "—", "RM 9,667.20"]];
  return (
    <Table aria-label="Maju 账单建议分录"><TableHeader><TableRow><TableHead>科目</TableHead><TableHead className="text-right">借方</TableHead><TableHead className="text-right">贷方</TableHead></TableRow></TableHeader><TableBody>{lines.map(([account, debit, credit]) => <TableRow key={account}><TableCell>{account}</TableCell><TableCell className="text-right tabular-nums">{debit}</TableCell><TableCell className="text-right tabular-nums">{credit}</TableCell></TableRow>)}</TableBody></Table>
  );
}

function DocumentsView({ frame = "cards" }: { frame?: "cards" | "continuous" | "brief" }) {
  if (frame === "brief") return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold tracking-wide text-muted-foreground">待处理文件</p><h2 className="mt-1 font-heading text-3xl font-medium">Maju Industrial 账单</h2><p className="mt-2 text-sm text-muted-foreground">核对原件、识别信息和账务处理。</p></div><Button variant="outline" disabled><Upload data-icon="inline-start" />上传文件</Button></div>
      <details open className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70">原件与识别信息<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="grid gap-4 border-t border-border p-4 xl:grid-cols-2"><DocumentOriginal /><TypedFacts /></div></details>
      <details className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70">建议日记账分录 · 借贷平衡<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="border-t border-border p-4"><DraftEntryTable /></div></details>
    </div>
  );
  return (
    <div className={cn(frame === "continuous" ? "border border-border bg-card" : "space-y-4")}>
      <div className={cn("flex flex-wrap items-center justify-between gap-3 p-4", frame === "continuous" && "border-b border-border")}><div><h2 className="font-heading text-xl font-medium">账单核对</h2><p className="text-sm text-muted-foreground">核对原件、识别信息和账务处理。</p></div><Button variant="outline" disabled><Upload data-icon="inline-start" />上传文件</Button></div>
      <div className={cn("grid gap-4 xl:grid-cols-2", frame === "continuous" ? "p-4" : "")}><DocumentOriginal /><TypedFacts /></div>
      <div className={cn("mt-4", frame === "continuous" && "border-t border-border p-4")}><h3 className="mb-3 font-heading font-medium">建议日记账分录 · 借贷平衡</h3><DraftEntryTable /></div>
    </div>
  );
}

function AttentionPanel({ items, select }: { items: WorkItem[]; select: (id: string) => void }) {
  const pending = items.filter((item) => item.status === "needs_you");
  const active = items.filter((item) => item.status === "processing");
  const recent = items.filter((item) => item.status === "complete");
  const next = pending[0] ?? active[0] ?? recent[0];
  return (
    <section aria-labelledby="attention-title" className="grid border-b border-border lg:grid-cols-[.72fr_1.28fr]">
      <div className="flex flex-col justify-between gap-5 bg-primary p-5 text-primary-foreground sm:p-6">
        <div><div className="text-sm text-primary-foreground/75">需要你</div><div className="mt-2 flex items-end gap-2"><span className="tabular-nums font-heading text-5xl font-medium leading-none">{pending.length}</span><span className="pb-1 text-sm text-primary-foreground/75">项工作</span></div><h2 id="attention-title" className="mt-4 max-w-sm font-heading text-xl font-medium">{pending.length > 0 ? `${pending.length} 项工作等待你的资料或决定` : "当前没有等待你的工作"}</h2></div>
        <Button variant="secondary" className="w-fit" disabled={!next} onClick={() => next && select(next.id)}><MessageSquareText data-icon="inline-start" />{pending.length > 0 ? "处理问题" : "查看进行中"}</Button>
      </div>
      <div className="divide-y divide-border bg-card">
        {pending.map((item) => <button type="button" key={item.id} onClick={() => select(item.id)} className="motion-fast group flex w-full items-center gap-4 px-5 py-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70 motion-reduce:transition-none"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/10 text-warning"><MessageSquareText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block font-medium text-foreground">{item.title}</span><span className="mt-1 block truncate text-sm text-muted-foreground">{item.summary}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></button>)}
        <div className="grid sm:grid-cols-2">
          <button type="button" disabled={!active[0]} onClick={() => active[0] && select(active[0].id)} className="p-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70 disabled:pointer-events-none sm:border-r sm:border-border"><div className="flex items-center justify-between"><span className="text-xs font-semibold tracking-wide text-muted-foreground">进行中</span><Badge variant="outline">{active.length}</Badge></div><div className="mt-2 truncate text-sm font-medium">{active[0]?.title ?? "没有进行中的工作"}</div></button>
          <button type="button" disabled={!recent[0]} onClick={() => recent[0] && select(recent[0].id)} className="p-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70 disabled:pointer-events-none"><div className="flex items-center justify-between"><span className="text-xs font-semibold tracking-wide text-muted-foreground">近期完成</span><Badge variant="outline">{recent.length}</Badge></div><div className="mt-2 truncate text-sm font-medium">{recent[0]?.title ?? "暂无近期完成"}</div></button>
        </div>
      </div>
    </section>
  );
}

function ReadinessPanel({ items, select }: { items: WorkItem[]; select: (id: string) => void }) {
  const pending = items.filter((item) => item.status === "needs_you").length;
  return (
    <Card size="sm" className="h-full">
      <CardHeader><CardTitle>8 月月结准备</CardTitle><CardDescription>按已收到资料与已完成检查列示</CardDescription><CardAction><Badge variant="outline" className={pending > 0 ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success"}>{pending > 0 ? `${pending} 项待答` : "无待答"}</Badge></CardAction></CardHeader>
      <CardContent className="space-y-0">
        {[["银行月结单", "2 / 2 已收到", true], ["采购文件", "3 / 3 已收到", true], ["关账检查", "4 / 6 已完成", false], ["待答工作", `${pending} 项`, pending === 0]].map(([label, value, ready]) => <div key={label as string} className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", ready ? "bg-success" : "bg-warning")} /><span className="text-sm">{label as string}</span></div><span className="text-sm tabular-nums text-muted-foreground">{value as string}</span></div>)}
      </CardContent>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3"><span className="text-xs leading-5 text-muted-foreground">仍有问题或检查时，不显示“已准备完成”。</span><Button variant="ghost" size="sm" onClick={() => select("WORK-2412")}>继续月结</Button></div>
    </Card>
  );
}

function VariantA({ surface, items, selectedItem, select, answered, answer, openRail, navigate, detailHeadingRef }: VariantProps) {
  if (surface === "documents") return <DocumentsView frame="continuous" />;
  if (surface === "accounting") return <div className="border border-border bg-card"><div className="grid gap-0 border-b border-border xl:grid-cols-[1fr_1.4fr]"><div className="p-5 xl:border-r xl:border-border"><PeriodTrend /></div><div className="p-5"><div className="mb-4"><h2 className="font-heading text-xl font-medium">近期日记账</h2><p className="text-sm text-muted-foreground">{PERIOD} · MYR · 合成数据</p></div><JournalTable /></div></div><MetricGrid divided /></div>;
  if (surface === "work") return <div className="grid gap-4 xl:grid-cols-[22rem_1fr]"><Card className="min-h-[38rem]"><CardHeader className="border-b"><CardTitle>全部工作</CardTitle><CardDescription>{items.filter((item) => item.status === "needs_you").length} 项等待你的资料或决定</CardDescription></CardHeader><CardContent className="p-0"><WorkList items={items} selected={selectedItem.id} select={select} /></CardContent></Card><Card><CardHeader className="border-b"><CardTitle>工作详情</CardTitle><CardDescription>问题、进度和结果保留在同一项工作中</CardDescription></CardHeader><CardContent><WorkDetail item={selectedItem} answered={answered} answer={answer} openRail={openRail} headingRef={detailHeadingRef} /></CardContent></Card></div>;
  return (
    <div className="min-w-0 overflow-hidden border border-border bg-card">
      <AttentionPanel items={items} select={select} />
      <MetricGrid divided />
      <section className="grid gap-4 border-t border-border bg-muted/25 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,.6fr)]"><Card><CardHeader><CardTitle>经营结果</CardTitle><CardDescription>六个月收入与费用 · MYR</CardDescription></CardHeader><CardContent><PeriodTrend /></CardContent></Card><ReadinessPanel items={items} select={select} /></section>
      <section className="grid gap-4 border-t border-border bg-muted/25 p-4 sm:p-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>现金</CardTitle><CardDescription>连续总账的月末余额</CardDescription></CardHeader><CardContent><BookCashTrend /></CardContent></Card><Card><CardHeader><CardTitle>营运资金</CardTitle><CardDescription>按到期日查看未结应收与应付</CardDescription></CardHeader><CardContent><OutstandingDueChart /></CardContent></Card></section>
      <section className="border-t border-border p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-heading text-lg font-medium">近期日记账</h2><p className="text-xs text-muted-foreground">{PERIOD} · MYR</p></div><Button variant="ghost" onClick={() => navigate("accounting")}>查看会计</Button></div><JournalTable compact /></section>
    </div>
  );
}

function VariantB({ surface, items, selectedItem, select, answered, answer, openRail, detailHeadingRef }: VariantProps) {
  if (surface === "documents") return <div className="grid gap-4 xl:grid-cols-[18rem_1fr]"><Card><CardHeader><CardTitle>文件队列</CardTitle><CardDescription>3 份文件</CardDescription></CardHeader><CardContent className="space-y-2"><button className="w-full cursor-default rounded-lg bg-muted p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70"><div className="font-medium">Maju_Bill_1488.pdf</div><div className="mt-1 text-xs text-muted-foreground">待确认供应商</div></button>{["Apex_Office_0826.pdf", "Westport_Receipt.jpg"].map(x => <button key={x} disabled className="w-full cursor-default rounded-lg p-3 text-left text-sm text-muted-foreground opacity-55">{x}</button>)}</CardContent></Card><Card><CardContent className="pt-0"><DocumentsView /></CardContent></Card></div>;
  if (surface === "accounting") return <div className="grid gap-4 xl:grid-cols-[20rem_1fr]"><Card><CardHeader><CardTitle>{PERIOD}</CardTitle><CardDescription>合成账簿摘要 · MYR</CardDescription></CardHeader><CardContent><MetricGrid /><Separator className="my-4" /><Button className="w-full" onClick={() => select("WORK-2412")}>打开月结工作</Button></CardContent></Card><Card><CardHeader><CardTitle>日记账工作台</CardTitle><CardDescription>按状态核对条目</CardDescription><CardAction><Button variant="outline" disabled>新建分录</Button></CardAction></CardHeader><CardContent><JournalTable /></CardContent></Card></div>;
  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Card className="min-h-[38rem]"><CardHeader className="border-b"><CardTitle>{surface === "home" ? "当前工作" : "全部工作"}</CardTitle><CardDescription>{surface === "home" ? `${items.filter(item => item.status === "needs_you").length} 项等待回答` : `${items.length} 项当前工作`}</CardDescription></CardHeader><CardContent className="p-0"><WorkList items={items} selected={selectedItem.id} select={select} compact={surface === "home"} /></CardContent></Card>
      <div className="space-y-4"><Card><CardHeader className="border-b"><CardTitle>工作详情</CardTitle><CardDescription>问题和结果保留在同一项工作中</CardDescription></CardHeader><CardContent><WorkDetail item={selectedItem} answered={answered} answer={answer} openRail={openRail} headingRef={detailHeadingRef} /></CardContent></Card>{surface === "home" && <Card><CardHeader><CardTitle>本期概览</CardTitle><CardDescription>{PERIOD} · MYR · {FRESHNESS}</CardDescription></CardHeader><CardContent><MetricGrid /></CardContent></Card>}</div>
    </div>
  );
}

function VariantC({ surface, items, selectedItem, select, answered, answer, openRail, detailHeadingRef }: VariantProps) {
  const heroTitle = selectedItem.id === "WORK-2409"
    ? answered ? "供应商已确认，Clara 正在继续完成这批采购文件。" : "先确认 Maju 供应商，Clara 会继续完成这批采购文件。"
    : selectedItem.id === "WORK-2411"
      ? "设备购置已经入账，下一步确认折旧起始日。"
      : selectedItem.id === "WORK-2412"
        ? "8 月月结正在复核两项检查。"
        : "Apex 账单核对已经完成，结果可供查阅。";
  const heroAction = selectedItem.id === "WORK-2409" && !answered ? "回答当前问题" : "查看工作上下文";
  if (surface === "documents") return <DocumentsView frame="brief" />;
  if (surface === "accounting") return <div className="space-y-5"><div><p className="text-xs font-semibold tracking-wide text-muted-foreground">会计简报</p><h2 className="mt-1 font-heading text-3xl font-medium">8 月账簿等待 {items.filter(item => item.status === "needs_you").length} 项确认</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{answered ? "Maju Industrial 供应商资料已经补足；Clara 正在继续处理相关采购文件。" : "确认 Maju Industrial 供应商后，Clara 会继续处理相关采购文件。"}</p></div><details open className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70">日记账 · 3 条<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="border-t border-border p-4"><JournalTable /></div></details><details className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70">现金与营运资金<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="grid gap-4 border-t border-border p-4 xl:grid-cols-[1fr_1.2fr]"><MetricGrid /><PeriodTrend /></div></details></div>;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-wide text-muted-foreground">今日工作简报</p><h2 className="mt-1 max-w-3xl font-heading text-3xl font-medium tracking-tight sm:text-4xl">{heroTitle}</h2><p className="mt-3 text-sm text-muted-foreground">{items.filter(item => item.status === "needs_you").length} 项需要你 · {items.filter(item => item.status === "processing").length} 项由 Clara 继续处理 · {PERIOD}</p></div><Button onClick={openRail}><Sparkles data-icon="inline-start" />{heroAction}</Button></section>
      <Card><CardContent><WorkDetail item={selectedItem} answered={answered} answer={answer} openRail={openRail} headingRef={detailHeadingRef} /></CardContent></Card>
      <details open={surface === "work"} className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70">全部工作 · 4 项<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="border-t border-border"><WorkList items={items} selected={selectedItem.id} select={select} compact /></div></details>
      <details className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70">本期经营详情 · {PERIOD}<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="space-y-4 border-t border-border p-4"><MetricGrid /><PeriodTrend /></div></details>
    </div>
  );
}

type VariantProps = {
  surface: Surface;
  items: WorkItem[];
  selectedItem: WorkItem;
  select: (id: string) => void;
  answered: boolean;
  answer: () => void;
  openRail: () => void;
  navigate: (surface: Surface) => void;
  detailHeadingRef: RefObject<HTMLHeadingElement | null>;
};

type ViewportKind = "unknown" | "narrow" | "wide";

function useViewportKind(): ViewportKind {
  const [viewport, setViewport] = useState<ViewportKind>("unknown");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setViewport(media.matches ? "wide" : "narrow");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return viewport;
}

function ClaraRail({ open, setOpen, closeWide, item, answered, answer, conversation, freshConversation, newChat, viewport }: {
  open: boolean;
  setOpen: (open: boolean) => void;
  closeWide: () => void;
  item: WorkItem;
  answered: boolean;
  answer: () => void;
  conversation: number;
  freshConversation: boolean;
  newChat: () => void;
  viewport: ViewportKind;
}) {
  const content = <NativeClaraChat item={item} answered={answered} onAnswer={answer} conversation={conversation} freshConversation={freshConversation} onNewChat={newChat} onClose={viewport === "wide" ? closeWide : undefined} />;
  return (
    <>
      {viewport === "wide" && <aside hidden={!open} className="sticky top-0 h-dvh min-h-0 w-[21rem] shrink-0 border-l border-border bg-background">{content}</aside>}
      {viewport === "narrow" && open && <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[min(92vw,24rem)] data-closed:pointer-events-none data-ending-style:pointer-events-none"><SheetHeader className="sr-only"><SheetTitle>Clara 对话</SheetTitle><SheetDescription>当前工作的上下文</SheetDescription></SheetHeader>{content}</SheetContent>
      </Sheet>}
    </>
  );
}

function VariantSwitcher({ variant, setVariant }: { variant: Variant; setVariant: (variant: Variant) => void }) {
  const move = (direction: -1 | 1) => {
    const current = VARIANTS.indexOf(variant);
    setVariant(VARIANTS[(current + direction + VARIANTS.length) % VARIANTS.length]!);
  };

  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="fixed inset-x-0 bottom-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-1rem)] items-center gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-lg supports-backdrop-filter:backdrop-blur-md">
      <PrototypeMark />
      <Button variant="ghost" size="icon-sm" aria-label="上一个方案" onClick={() => move(-1)}><ArrowLeft /></Button>
      <div className="flex rounded-lg bg-muted p-1" aria-label="视觉方案">
        {VARIANTS.map((key) => <Button key={key} size="sm" variant={variant === key ? "default" : "ghost"} onClick={() => setVariant(key)} aria-pressed={variant === key}>{key}</Button>)}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="下一个方案" onClick={() => move(1)}><ArrowRight /></Button>
    </div>
  );
}

export function ClaraVisualPrototype() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryVariant = searchParams.get("variant")?.toUpperCase();
  const variant: Variant = VARIANTS.includes(queryVariant as Variant) ? queryVariant as Variant : "A";
  const [surface, setSurface] = useState<Surface>("home");
  const [selected, setSelected] = useState("WORK-2409");
  const [answered, setAnswered] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [conversation, setConversation] = useState(1);
  const [freshConversation, setFreshConversation] = useState(false);
  const railTriggerRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusWorkHeadingOnEntry = useRef(false);
  const viewport = useViewportKind();
  useEffect(() => {
    if (viewport !== "unknown") setRailOpen(viewport === "wide");
  }, [viewport]);
  useEffect(() => {
    if (surface === "work" && focusWorkHeadingOnEntry.current) {
      focusWorkHeadingOnEntry.current = false;
      detailHeadingRef.current?.focus();
    }
  }, [surface, selected]);
  const items = useMemo(() => INITIAL_WORK.map(item => item.id === "WORK-2409" && answered ? { ...item, status: "processing" as const, summary: "供应商已确认；Clara 正在处理第 3 份采购文件。", progress: "已完成 2 / 3 · 继续处理中" } : item), [answered]);
  const selectedItem = items.find(item => item.id === selected) ?? items[0]!;

  const setVariant = (next: Variant) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const navigate = (next: Surface) => {
    focusWorkHeadingOnEntry.current = next === "work" && surface !== "work";
    setSurface(next);
  };
  const select = (id: string) => {
    focusWorkHeadingOnEntry.current = surface !== "work";
    setSelected(id);
    setSurface("work");
    setFreshConversation(false);
  };
  const answer = () => { setAnswered(true); setSelected("WORK-2409"); setFreshConversation(false); };
  const closeWideRail = () => {
    setRailOpen(false);
    railTriggerRef.current?.focus();
  };

  const props: VariantProps = { surface, items, selectedItem, select, answered, answer, openRail: () => setRailOpen(true), navigate, detailHeadingRef };
  return (
    <TooltipProvider>
      <SidebarProvider className="bg-shell text-foreground">
        <PrototypeSidebar surface={surface} setSurface={navigate} needsYou={items.filter((item) => item.status === "needs_you").length} />
        <SidebarInset className="min-w-0 bg-shell">
          <ScopeHeader surface={surface} openRail={() => setRailOpen(true)} railTriggerRef={railTriggerRef} variant={variant} />
          <section aria-label="客户工作区" className="min-w-0 flex-1 p-3 pb-24 sm:p-5 sm:pb-24 lg:p-6 lg:pb-24">
            {variant === "A" ? <VariantA {...props} /> : variant === "B" ? <VariantB {...props} /> : <VariantC {...props} />}
          </section>
        </SidebarInset>
        <ClaraRail open={railOpen} setOpen={setRailOpen} closeWide={closeWideRail} item={selectedItem} answered={answered} answer={answer} conversation={conversation} freshConversation={freshConversation} viewport={viewport} newChat={() => { setConversation(value => value + 1); setFreshConversation(true); setRailOpen(true); }} />
        <VariantSwitcher variant={variant} setVariant={setVariant} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
