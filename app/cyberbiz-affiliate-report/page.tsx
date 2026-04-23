"use client";

import React, { useState } from 'react';
import styles from './page.module.css';

interface KPI {
  label: string;
  value: string;
  unit?: string;
  trend?: number;
  color?: string;
}

interface ChartDataPoint {
  date: string;
  gmv: number;
  aov: number;
}

interface Product {
  id: string;
  name: string;
  category: string;
  orders: number;
  gmv: number;
  cvr: number;
}

interface Activity {
  date: string;
  name: string;
  clicks: number;
  orders: number;
  gmv: number;
  cvr: number;
  aov: number;
  commission: number;
}

export default function CyberBizAffiliateReportPage() {
  const [dateRange, setDateRange] = useState('30');

  // Mock data
  const kpis: KPI[] = [
    {
      label: '推廣總銷售額 (GMV)',
      value: '₦317,980.00',
      color: '#17a2b8',
      trend: 5.2
    },
    {
      label: 'CyberBiz 訂單總數',
      value: '1,66',
      unit: ''
    },
    {
      label: '平均客戶值 (AOV)',
      value: '₦7,756.00'
    },
    {
      label: '聯盟轉化率 (Affiliate CVR)',
      value: '16.92%'
    },
    {
      label: '預估佣金 (Est. Commission)',
      value: '₦3,000.00'
    }
  ];

  const chartData: ChartDataPoint[] = [
    { date: '1日', gmv: 378, aov: 20.5 },
    { date: '2日', gmv: 321, aov: 21.0 },
    { date: '3日', gmv: 338, aov: 22.1 },
    { date: '4日', gmv: 636, aov: 25.0 },
    { date: '5日', gmv: 436, aov: 23.5 },
    { date: '6日', gmv: 339, aov: 24.0 },
    { date: '7日', gmv: 603, aov: 26.0 },
    { date: '8日', gmv: 638, aov: 27.0 },
    { date: '9日', gmv: 905, aov: 28.5 },
    { date: '10日', gmv: 1074, aov: 31.0 },
    { date: '11日', gmv: 956, aov: 32.0 },
    { date: '12日', gmv: 923, aov: 30.5 },
    { date: '13日', gmv: 681, aov: 29.0 },
    { date: '14日', gmv: 1072, aov: 33.0 },
    { date: '15日', gmv: 883, aov: 31.5 },
    { date: '16日', gmv: 1002, aov: 34.0 },
    { date: '17日', gmv: 768, aov: 30.0 },
    { date: '18日', gmv: 985, aov: 32.5 },
    { date: '19日', gmv: 1583, aov: 35.0 },
    { date: '20日', gmv: 1034, aov: 36.0 },
  ];

  const topProducts: Product[] = [
    {
      id: '1',
      name: '不間推廣道具',
      category: 'Facebook',
      orders: 2500,
      gmv: 50000,
      cvr: 18.5
    },
    {
      id: '2',
      name: '推廣策略',
      category: '推廣策略',
      orders: 2200,
      gmv: 45000,
      cvr: 16.2
    },
    {
      id: '3',
      name: 'Twitter',
      category: 'Twitter',
      orders: 1800,
      gmv: 38000,
      cvr: 14.5
    },
    {
      id: '4',
      name: '其他',
      category: '其他',
      orders: 1500,
      gmv: 32000,
      cvr: 12.8
    }
  ];

  const activities: Activity[] = [
    {
      date: '2022/06/21',
      name: '商品促銷 1',
      clicks: 154,
      orders: 65,
      gmv: 317980,
      cvr: 16.92,
      aov: 4890,
      commission: 30000
    },
    {
      date: '2022/06/11',
      name: '商品促銷Medium',
      clicks: 76,
      orders: 19,
      gmv: 327900,
      cvr: 13.32,
      aov: 17263,
      commission: 30000
    },
    {
      date: '2022/06/10',
      name: '商品促銷 2',
      clicks: 16,
      orders: 9,
      gmv: 107700,
      cvr: 16.92,
      aov: 11967,
      commission: 30000
    }
  ];

  const maxGMV = Math.max(...chartData.map(d => d.gmv));
  const maxAOV = Math.max(...chartData.map(d => d.aov));

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1>CyberBiz 導購成效綜合報表</h1>
        <p className={styles.subtitle}>申接狀態：<span className={styles.status}>CyberBiz 數據已連線</span></p>
      </div>

      {/* Date Range Selector */}
      <div className={styles.filterBar}>
        <label htmlFor="dateRange">範圍：</label>
        <select id="dateRange" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
          <option value="7">近 7 天</option>
          <option value="30">近 30 天</option>
          <option value="90">近 90 天</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        {kpis.map((kpi, index) => (
          <div 
            key={index} 
            className={`${styles.kpiCard} ${kpi.color ? styles[`kpi-${kpi.color}`] : ''}`}
            style={kpi.color ? { borderLeft: `5px solid ${kpi.color}` } : {}}
          >
            <div className={styles.kpiLabel}>{kpi.label}</div>
            <div className={styles.kpiValue}>
              {kpi.value}
              {kpi.unit && <span className={styles.unit}>{kpi.unit}</span>}
            </div>
            {kpi.trend && (
              <div className={styles.kpiTrend}>
                <span className={styles.trendUp}>↑ {kpi.trend}%</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className={styles.chartSection}>
        <h2>推廣 GMV 趨勢與客戶價值變化</h2>
        <div className={styles.chartContainer}>
          <svg viewBox="0 0 1200 400" className={styles.chart}>
            {/* Grid lines */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={`gridline-${i}`}
                x1="80"
                y1={50 + i * 70}
                x2="1180"
                y2={50 + i * 70}
                stroke="#e0e0e0"
                strokeDasharray="5,5"
              />
            ))}

            {/* Y-axis labels */}
            <text x="30" y="55" fontSize="12" fill="#666">
              25,00K
            </text>
            <text x="30" y="125" fontSize="12" fill="#666">
              20,00K
            </text>
            <text x="30" y="195" fontSize="12" fill="#666">
              15,00K
            </text>
            <text x="30" y="265" fontSize="12" fill="#666">
              10,00K
            </text>
            <text x="30" y="335" fontSize="12" fill="#666">
              5,00K
            </text>

            {/* GMV Line Chart */}
            <polyline
              points={chartData.map((d, i) => {
                const x = 80 + (i * (1100 / (chartData.length - 1)));
                const y = 350 - (d.gmv / maxGMV) * 280;
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#17a2b8"
              strokeWidth="2"
            />

            {/* Data points */}
            {chartData.map((d, i) => {
              const x = 80 + (i * (1100 / (chartData.length - 1)));
              const y = 350 - (d.gmv / maxGMV) * 280;
              return (
                <circle
                  key={`point-${i}`}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="#17a2b8"
                />
              );
            })}

            {/* X-axis */}
            <line x1="80" y1="350" x2="1180" y2="350" stroke="#333" strokeWidth="1" />

            {/* X-axis labels */}
            {chartData.map((d, i) => {
              if (i % 3 === 0) {
                const x = 80 + (i * (1100 / (chartData.length - 1)));
                return (
                  <text key={`label-${i}`} x={x} y="375" fontSize="12" fill="#666" textAnchor="middle">
                    {d.date}
                  </text>
                );
              }
              return null;
            })}
          </svg>
        </div>
        <div className={styles.chartLegend}>
          <span className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#17a2b8' }}></span>
            推廣 GMV 趨勢與客戶價值變化
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#20c997' }}></span>
            依來源/分組的轉換，233, 1,583
          </span>
        </div>
      </div>

      {/* Product Performance Section */}
      <div className={styles.performanceSection}>
        <div className={styles.performanceColumn}>
          <h3>Top 5 熱門推廣商品 category performance</h3>
          <div className={styles.barChart}>
            {topProducts.map((product, index) => {
              const maxOrders = Math.max(...topProducts.map(p => p.orders));
              const width = (product.orders / maxOrders) * 100;
              return (
                <div key={product.id} className={styles.barItem}>
                  <div className={styles.barLabel}>
                    <span className={styles.rank}>{index + 1}</span>
                    <span>{product.name}</span>
                  </div>
                  <div className={styles.bar}>
                    <div className={styles.barFill} style={{ width: `${width}%` }}></div>
                  </div>
                  <div className={styles.barValue}>{product.orders.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.performanceColumn}>
          <h3>不同推廣渠道 source impact</h3>
          <div className={styles.pieChart}>
            <svg viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="80" fill="#0984e3" />
              <circle cx="100" cy="100" r="60" fill="white" />
              <text x="100" y="105" textAnchor="middle" fontSize="24" fontWeight="bold">
                流量來源
              </text>
            </svg>
            <div className={styles.pieChartLegend}>
              <div>流量來源</div>
              <div>信息</div>
              <div>其他</div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Details Table */}
      <div className={styles.tableSection}>
        <h2>活動與渠道選項詳細數據表格</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>日期/活動名稱</th>
                <th>點擊數</th>
                <th>CyberBiz 訂單 (Orders)</th>
                <th>GMV</th>
                <th>CVR</th>
                <th>AOV</th>
                <th>佣金</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity, index) => (
                <tr key={index}>
                  <td>
                    <div className={styles.activityCell}>
                      <span className={styles.date}>{activity.date}</span>
                      <span className={styles.name}>{activity.name}</span>
                    </div>
                  </td>
                  <td>{activity.clicks}</td>
                  <td>{activity.orders}</td>
                  <td>₦{activity.gmv.toLocaleString()}</td>
                  <td>{activity.cvr.toFixed(2)}%</td>
                  <td>₦{activity.aov.toLocaleString()}</td>
                  <td>₦{activity.commission.toLocaleString()}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td>本月總額</td>
                <td>337</td>
                <td>1.66</td>
                <td>₦317,980</td>
                <td>16.92%</td>
                <td>16.92%</td>
                <td>₦30,000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
