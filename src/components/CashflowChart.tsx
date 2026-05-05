"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: { monthLabel: string; total: number }[];
}

export default function CashflowChart({ data }: Props) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#449dd7" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#449dd7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eae9e4" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#eae9e4" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              new Intl.NumberFormat("de-AT", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(v)
            }
          />
          <Tooltip
            formatter={(value: number) =>
              new Intl.NumberFormat("de-AT", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(value)
            }
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #eae9e4",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#449dd7"
            strokeWidth={2}
            fill="url(#cf)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
