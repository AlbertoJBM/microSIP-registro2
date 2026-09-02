// dashboard/src/Dashboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import {
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import styled from 'styled-components';

interface AgentStats {
  agent_username: string;
  agent_full_name: string;
  total_calls: number;
  entrantes_atendidas: number;
  entrantes_nao_atendidas: number;
  salientes_atendidas: number;
  salientes_nao_atendidas: number;
  avg_duration: number;
}

interface DashboardData {
  overall: {
    total_calls: number;
    entrantes_atendidas: number;
    entrantes_nao_atendidas: number;
    salientes_atendidas: number;
    salientes_nao_atendidas: number;
    avg_duration: number;
  };
  agents: AgentStats[];
  daily?: any[];
  hourlyCalls?: Array<{ 
    hour: number; 
    total_calls: number;
    atendidas: number;
    nao_atendidas: number;
  }>;
}

interface CallRecord {
  id: number;
  original_id: number;
  callId: string;
  agent_username: string;
  agent_full_name: string;
  number: string;
  name: string;
  type: number;
  type_description: string;
  time: number;
  formatted_time: string;
  duration: number;
  info: string;
  synced_at: string;
  loja: string;
  sector: string;
  sector_name: string;
  location_city?: string;
  location_neighborhood?: string;
}

interface FilterOptions {
  users: Array<{ username: string; full_name: string }>;
  lojas: string[];
  sectors: Array<{ code: string; name: string }>;
}

interface TopPerformer {
  name: string;
  value: number;
  metric: string;
}

type HourlyView = 'general' | 'incoming' | 'outgoing';

const DashboardContainer = styled.div`
  display: flex;
  min-height: 100vh;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: radial-gradient(circle at 88% 8%, rgba(42,141,255,0.22), transparent 28%), radial-gradient(circle at 12% 92%, rgba(119,79,255,0.16), transparent 32%), #07111f;
`;

const Sidebar = styled.div<{ isOpen: boolean }>`
  width: 280px;
  background: linear-gradient(180deg, #1e3a8a 0%, #1e40af 100%);
  color: white;
  padding: 20px 0;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
  box-shadow: 2px 0 10px rgba(0,0,0,0.1);
  transform: ${props => props.isOpen ? 'translateX(0)' : 'translateX(-100%)'};
  transition: transform 0.3s ease-in-out;
  z-index: 1000;

`;

const Overlay = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: ${props => props.isOpen ? 'block' : 'none'};

  @media (min-width: 1024px) {
    display: none;
  }
`;

const MenuButton = styled.button<{ sidebarOpen: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  top: 50%;
  left: ${props => props.sidebarOpen ? '264px' : '0'};
  transform: translateY(-50%);
  z-index: 1100;
  width: 28px;
  height: 76px;
  background: rgba(25,57,96,0.94);
  color: white;
  border: 1px solid rgba(255,255,255,0.18);
  border-left: 0;
  border-radius: 0 12px 12px 0;
  padding: 0;
  cursor: pointer;
  box-shadow: 8px 0 24px rgba(0,0,0,0.22);
  font-size: 16px;
  transition: left 260ms ease-out;
`;

const SidebarHeader = styled.div`
  padding: 0 20px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  margin-bottom: 20px;
`;

const SidebarTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SidebarSection = styled.div`
  padding: 0 20px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
`;

const SectionTitle = styled.h3`
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.7);
  margin: 0 0 15px;
  font-weight: 600;
`;

const FilterGroup = styled.div`
  margin-bottom: 20px;
`;

const FilterLabel = styled.label`
  display: block;
  font-size: 12px;
  margin-bottom: 5px;
  color: rgba(255,255,255,0.8);
`;

const FilterInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  background: rgba(255,255,255,0.1);
  color: white;
  font-size: 13px;
  
  &::placeholder {
    color: rgba(255,255,255,0.5);
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255,255,255,0.4);
    background: rgba(255,255,255,0.15);
  }
`;

const FilterSelect = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  background: rgba(255,255,255,0.1);
  color: white;
  font-size: 13px;
  
  option {
    background: #1e3a8a;
    color: white;
  }
`;

const ChartOrderSelect = styled.select`
  padding: 7px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: rgba(19,35,58,0.78);
  color: #dbeafe;
  font-size: 13px;
`;

const Button = styled.button`
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
  margin-bottom: 8px;
`;

const PrimaryButton = styled(Button)`
  background: #3b82f6;
  color: white;
  
  &:hover {
    background: #2563eb;
  }
`;

const SecondaryButton = styled(Button)`
  background: rgba(255,255,255,0.1);
  color: white;
  
  &:hover {
    background: rgba(255,255,255,0.2);
  }
`;

const MainContent = styled.div<{ sidebarOpen: boolean }>`
  flex: 1;
  margin-left: 0;
  padding: 30px;
  padding-top: 80px;
  transition: margin-left 260ms ease-out;

  @media (min-width: 1024px) {
    margin-left: ${props => props.sidebarOpen ? '280px' : '0'};
    padding-top: 30px;
  }
`;

const Header = styled.div`
  background: linear-gradient(135deg, rgba(15,35,62,0.98), rgba(9,22,40,0.96));
  padding: 25px 30px;
  border-radius: 22px;
  border: 1px solid rgba(100,216,255,0.24);
  box-shadow: 0 18px 50px rgba(30,64,175,0.12);
  backdrop-filter: blur(22px);
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
`;

const HeaderTitle = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: #f7fbff;
  margin: 0;
`;

const HeaderSubtitle = styled.p`
  color: #9fb3ca;
  margin: 5px 0 0 0;
  font-size: 14px;
`;

const AgentStrip = styled.div`
  display: flex;
  justify-content: center;
  gap: 22px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(30,64,175,0.12);
  @media (max-width: 640px) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px 10px;
  }
`;

const AgentButton = styled.button<{ selected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 124px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  transition: transform 180ms ease-out;
  &:hover { transform: translateY(-2px); }
  & > span { max-width: 124px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; color: ${props => props.selected ? '#1e3a8a' : '#64748b'}; }
`;

const AgentAvatar = styled.span<{ selected: boolean }>`
  display: grid;
  place-items: center;
  width: clamp(76px, 10vw, 116px);
  height: clamp(76px, 10vw, 116px);
  overflow: hidden;
  border-radius: 50%;
  border: 3px solid ${props => props.selected ? '#3b82f6' : 'rgba(30,64,175,0.18)'};
  background: #eaf3ff;
  box-shadow: ${props => props.selected ? '0 0 0 6px rgba(59,130,246,0.16), 0 16px 30px rgba(30,64,175,0.30)' : '0 8px 20px rgba(30,64,175,0.16)'};
  transform: ${props => props.selected ? 'translateY(-4px) scale(1.04)' : 'none'};
  transition: all 180ms ease-out;
`;

const AgentAvatarImage = styled.img`
  width: 100%; height: 100%; object-fit: cover;
`;

{/*const AgentSelectionHint = styled.span`
  margin-left: auto; align-self: center; color: #9fb3ca; font-size: 12px;
`;*/}

const IconeNavegacao = styled.img`width: 34px; height: 34px; object-fit: contain; filter: drop-shadow(0 0 8px rgba(100,216,255,.45)); flex: 0 0 auto;`;
const IconeTitulo = styled.img`width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(100,216,255,.5)); flex: 0 0 auto;`;
const OverviewContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
  margin-top: 22px;

  & > :nth-child(3) { order: 1; }
  & > :nth-child(2) { order: 2; }
`;

const DashboardSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const SectionHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
`;

const KPIGrid = styled.div`
  display: grid;
  text-align: center;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 22px;
  margin-bottom: 8px;
`;

const KPICard = styled.div<{ color?: string }>`
  background: rgba(19,35,58,0.78);
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border-left: 4px solid ${props => props.color || '#3b82f6'};
`;

const KPIValue = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: #f7fbff;
  margin: 8px 0;
`;

const KPILabel = styled.div`
  font-size: 12px;
  color: #9fb3ca;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const KPIChange = styled.div<{ positive?: boolean }>`
  font-size: 12px;
  color: ${props => props.positive ? '#10b981' : '#ef4444'};
  font-weight: 600;
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 25px;
  margin-bottom: 25px;
`;

const ChartCard = styled.div`
  background: linear-gradient(180deg, rgba(18,32,52,0.94), rgba(13,24,41,0.88));
  padding: 25px;
  border-radius: 16px;
  border: 1px solid rgba(126, 162, 220, 0.18);
  box-shadow: 0 18px 40px rgba(15,23,42,0.2), inset 0 1px 0 rgba(148,163,184,0.08);
  backdrop-filter: blur(10px);
`;

const ChartTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #f7fbff;
  margin: 0 0 20px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ChartActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const ChartActionButton = styled.button<{ active?: boolean }>`
  border: 1px solid ${props => props.active ? '#2563eb' : '#cbd5e1'};
  border-radius: 5px;
  background: ${props => props.active ? '#2563eb' : 'white'};
  color: ${props => props.active ? 'white' : '#475569'};
  cursor: pointer;
  font-size: 11px;
  padding: 5px 8px;
`;

const ChartPeriod = styled.div`
  color: #9fb3ca;
  font-size: 12px;
  margin-top: 12px;
  text-align: left;
`;

const TopList = styled.div`
  background: rgba(19,35,58,0.78);
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  margin-bottom: 25px;
`;

const TopItem = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
  
  &:last-child {
    border-bottom: none;
  }
`;

const TopRank = styled.div<{ rank: number }>`
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: ${props => props.rank <= 3 ? '#3b82f6' : '#e2e8f0'};
  color: ${props => props.rank <= 3 ? 'white' : '#64748b'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  margin-right: 15px;
`;

const TopInfo = styled.div`
  flex: 1;
`;

const TopName = styled.div`
  font-weight: 600;
  color: #f7fbff;
  font-size: 14px;
`;

const TopValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: #3b82f6;
`;

const TopMetric = styled.div`
  font-size: 12px;
  color: #9fb3ca;
`;
//----------------------------------------------------------------variable de colores-----------------------------------//
//const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const CallsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: rgba(19,35,58,0.78);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
`;

const TableHeader = styled.th`
  background: #f8fafc;
  color: #475569;
  padding: 15px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TableCell = styled.td`
  padding: 15px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  color: #dbeafe;
`;

const TableRow = styled.tr`
  &:hover {
    background: #f8fafc;
  }
`;

export const Dashboard: React.FC = () => {
  // Detectar URL del servidor dinámicamente para soportar acceso desde red
  const SERVER_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://localhost:3001'
    : window.location.origin;

  const [data, setData] = useState<DashboardData | null>(null);
  const [connectedAgents, setConnectedAgents] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filteredCalls, setFilteredCalls] = useState<CallRecord[]>([]);
  const [lojaStats, setLojaStats] = useState<any[]>([]);
  
  const [topPerformers, setTopPerformers] = useState<{
    topAgents: TopPerformer[];
    topAtendidas: TopPerformer[];
    topNaoAtendidas: TopPerformer[];
    topSalientes: TopPerformer[];
    topLojas: TopPerformer[];
    topOutgoingLojas: TopPerformer[];
    topAttendedLojas: TopPerformer[];
    topUnattendedLojas: TopPerformer[];
    topMissed: TopPerformer[];
  }>({
    topAgents: [],
    topAtendidas: [],
    topNaoAtendidas: [],
    topSalientes: [],
    topLojas: [],
    topOutgoingLojas: [],
    topAttendedLojas: [],
    topUnattendedLojas: [],
    topMissed: []
  });

  // City ranking order and expanded city for showing stores
  const [cityOrder, setCityOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedCity, setExpandedCity] = useState<string | null>(null);

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedLoja, setSelectedLoja] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [hourlyView, setHourlyView] = useState<HourlyView>('general');
  const [hourlyOrder, setHourlyOrder] = useState<'natural' | 'desc' | 'asc'>('natural');
  const [agentOrder, setAgentOrder] = useState<'natural' | 'desc' | 'asc'>('natural');
  const [activeTab, setActiveTab] = useState<'overview' | 'calls' | 'tops'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const filterParamsRef = useRef(new URLSearchParams());

  const getFilterParams = (users = selectedUsers) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    users.forEach((user) => params.append('user', user));
    if (selectedLoja) params.append('loja', selectedLoja);
    if (selectedSector) params.append('sector', selectedSector);
    return params;
  };

  useEffect(() => {
    filterParamsRef.current = getFilterParams();
  }, [startDate, endDate, selectedUsers, selectedLoja, selectedSector]);

  const fetchDashboardData = async (params = new URLSearchParams()) => {
    try {
      console.log('Fetching dashboard data...');
      const response = await fetch(`${SERVER_URL}/api/stats?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const stats = await response.json();
      console.log('Dashboard data received:', stats);
      setData(stats);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setData({
        overall: {
          total_calls: 0,
          entrantes_atendidas: 0,
          entrantes_nao_atendidas: 0,
          salientes_atendidas: 0,
          salientes_nao_atendidas: 0,
          avg_duration: 0
        },
        agents: [],
        daily: [],
        hourlyCalls: []
      });
    }
  };

  const fetchFilterOptions = async () => {
    try {
      console.log('Fetching filter options...');
      const response = await fetch(`${SERVER_URL}/api/filters`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const options = await response.json();
      console.log('Filter options received:', options);
      setFilterOptions(options);
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
      setFilterOptions({
        users: [],
        lojas: [],
        sectors: []
      });
    }
  };

  const fetchFilteredCalls = async (params: URLSearchParams) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/calls?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      setFilteredCalls(await response.json());
    } catch (error) {
      console.error('Falha ao atualizar registros:', error);
    }
  };

  const fetchLojaStats = async (params = new URLSearchParams()) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/stats/by-loja?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setLojaStats(data);
    } catch (error) {
      console.error('Failed to fetch loja stats:', error);
      setLojaStats([]);
    }
  };

  const applyFilters = async (users = selectedUsers) => {
    try {
      const params = getFilterParams(users);

      const [callsResponse, statsResponse] = await Promise.all([
        fetch(`${SERVER_URL}/api/calls?${params.toString()}`),
        fetch(`${SERVER_URL}/api/stats?${params.toString()}`)
      ]);
      if (!callsResponse.ok || !statsResponse.ok) throw new Error('Falha ao aplicar os filtros');
      const calls = await callsResponse.json();
      const stats = await statsResponse.json();
      setFilteredCalls(calls);
      setData(stats);
    } catch (error) {
      console.error('Failed to apply filters:', error);
    }
  };

  const toggleAgent = async (username: string) => {
    const nextUsers = selectedUsers.includes(username)
      ? selectedUsers.filter((user) => user !== username)
      : [...selectedUsers, username];
    setSelectedUsers(nextUsers);
    await applyFilters(nextUsers);
  };

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedUsers([]);
    setSelectedLoja('');
    setSelectedSector('');
    fetchAllCalls();
    fetchDashboardData();
  };

  const fetchAllCalls = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/calls`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      setFilteredCalls(await response.json());
    } catch (error) {
      console.error('Failed to fetch all calls:', error);
      setFilteredCalls([]);
    }
  };

  const escapeCSV = (value: any) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportFilteredCallsCSV = () => {
    if (!filteredCalls || filteredCalls.length === 0) return;
    const headers = ['id','callId','data','agent_username','agent_full_name','number','name','loja','location_city','sector_name','type_description','duration','synced_at','info'];
    const rows = filteredCalls.map(c => headers.map(h => {
      switch (h) {
        case 'data': return escapeCSV(c.formatted_time);
        default: return escapeCSV(c[h as keyof CallRecord]);
      }
    }).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const calculateTopPerformers = () => {
    if (!data || !data.agents) return;

    // Top agentes por total de chamadas
    const topAgents = data.agents
      .map(agent => ({
        name: agent.agent_full_name || agent.agent_username,
        value: agent.total_calls,
        metric: 'chamadas'
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top agentes por entrantes atendidas
    const topAtendidas = data.agents
      .map(agent => ({
        name: agent.agent_full_name || agent.agent_username,
        value: agent.entrantes_atendidas,
        metric: 'entrantes atendidas'
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top agentes por entrantes não atendidas
    const topNaoAtendidas = data.agents
      .filter(agent => agent.entrantes_nao_atendidas > 0)
      .map(agent => ({
        name: agent.agent_full_name || agent.agent_username,
        value: agent.entrantes_nao_atendidas,
        metric: 'entrantes não atendidas'
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top agentes por salientes atendidas
    const topSalientes = data.agents
      .map(agent => ({
        name: agent.agent_full_name || agent.agent_username,
        value: agent.salientes_atendidas,
        metric: 'salientes atendidas'
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    setTopPerformers(prev => ({
      ...prev,
      topAgents,
      topAtendidas,
      topNaoAtendidas,
      topSalientes
    }));
  };

  useEffect(() => {
    calculateTopPerformers();
  }, [data]);

  useEffect(() => {
    // Conectar al WebSocket
    const socket = io(SERVER_URL);

    // Cargar datos iniciales
    fetchFilterOptions();
    applyFilters();
    fetchLojaStats();

    socket.on('new-logs', () => {
      const currentFilters = new URLSearchParams(filterParamsRef.current);
      fetchDashboardData(currentFilters);
      fetchFilteredCalls(currentFilters);
      fetchFilterOptions();
      fetchLojaStats(currentFilters);
    });

    socket.on('agent-connected', (agentName: string) => {
      setConnectedAgents(prev => [...prev, agentName]);
    });

    socket.on('agent-disconnected', (agentName: string) => {
      setConnectedAgents(prev => prev.filter(a => a !== agentName));
    });

    socket.on('agents-list', (agents: string[]) => {
      setConnectedAgents(Array.isArray(agents) ? agents : []);
    });

    // Actualizar cada 30 segundos
    const interval = setInterval(() => {
      const currentFilters = new URLSearchParams(filterParamsRef.current);
      fetchDashboardData(currentFilters);
      fetchFilteredCalls(currentFilters);
      fetchLojaStats(currentFilters);
    }, 30000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  if (!data) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{ fontSize: '48px' }}>Carregando...</div>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Carregando dashboard...</div>
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>
          Conectando ao servidor...
        </div>
      </div>
    );
  }

  const hourlyChartData = Array.from({ length: 24 }, (_, hour) => {
    const callsInHour = filteredCalls.filter(call => {
      const callHour = Number(call.formatted_time.slice(11, 13));
      return callHour === hour && (hourlyView === 'general' || call.type === (hourlyView === 'incoming' ? 1 : 2));
    });
    
    return {
      hour: `${String(hour).padStart(2, '0')}:00`,
      total_calls: callsInHour.length,
      atendidas: callsInHour.filter(call => call.duration > 0).length,
      nao_atendidas: callsInHour.filter(call => call.duration === 0).length
    };
  }).sort((a, b) => hourlyOrder === 'natural'
    ? Number(a.hour.slice(0, 2)) - Number(b.hour.slice(0, 2))
    : hourlyOrder === 'desc'
      ? b.total_calls - a.total_calls
      : a.total_calls - b.total_calls);

  const periodDates = filteredCalls
    .map(call => call.formatted_time)
    .filter(Boolean)
    .sort();
  const formatPeriod = (date: string) => {
    const match = date.match(/^(\d{4})-(\d{2})/);
    return match ? `${match[2]}/${match[1]}` : 'período não informado';
  };
  const periodLabel = periodDates.length > 0
    ? `Gráfico de ${formatPeriod(periodDates[0])} a ${formatPeriod(periodDates[periodDates.length - 1])}`
    : 'Gráfico sem registros no período selecionado';

  const agentChartData = [...(data.agents || [])].sort((a, b) => agentOrder === 'natural'
    ? 0
    : agentOrder === 'desc'
      ? b.total_calls - a.total_calls
      : a.total_calls - b.total_calls);

  const totalCalls = data?.overall?.total_calls || 0;
  const callPercentage = (value: number | undefined) => totalCalls > 0 ? `${Math.round(((value || 0) / totalCalls) * 100)}% do total` : '0% do total';
  let cityMapData = Object.values((filteredCalls.length > 0 ? filteredCalls : lojaStats).reduce((cities: Record<string, { city: string; stores: string[]; totalCalls: number; atendidas: number }>, item: any) => {
    const resolvedCity = item.location_city || item.cidade || item.city || 'Cidade não identificada';
    const city = String(resolvedCity || 'Cidade não identificada').trim();

    if (!cities[city]) {
      cities[city] = { city, stores: [], totalCalls: 0, atendidas: 0 };
    }

    const lojaRef = item.loja ?? item.store ?? item.location_loja;
    if (lojaRef) cities[city].stores.push(String(lojaRef));

    const totalCallsValue = Number(item.total_calls ?? item.calls ?? 1);
    const attendedValue = Number(item.entrantes_atendidas ?? (item.duration !== undefined && Number(item.duration) > 0 ? 1 : 0));

    cities[city].totalCalls += Number.isFinite(totalCallsValue) ? totalCallsValue : 1;
    cities[city].atendidas += Number.isFinite(attendedValue) ? attendedValue : 0;

    return cities;
  }, {}));

  cityMapData = cityMapData.sort((a, b) => {
    const primary = cityOrder === 'desc' ? b.totalCalls - a.totalCalls : a.totalCalls - b.totalCalls;
    if (primary !== 0) return primary;
    return cityOrder === 'desc' ? b.atendidas - a.atendidas : a.atendidas - b.atendidas;
  });
  return (
    <DashboardContainer>
      <MenuButton
        sidebarOpen={isSidebarOpen}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label={isSidebarOpen ? 'Fechar barra lateral' : 'Abrir barra lateral'}
      >
        {isSidebarOpen ? '‹' : '☰'}
      </MenuButton>
      
      <Overlay isOpen={isSidebarOpen} onClick={() => setIsSidebarOpen(false)} />
      
      <Sidebar isOpen={isSidebarOpen}>
        <SidebarHeader>
          <SidebarTitle>
            <IconeNavegacao src="/img/icone/discurso.png" alt="" /> Central de Chamadas
          </SidebarTitle>
        </SidebarHeader>

        <SidebarSection>
          <SectionTitle>Filtros de Data</SectionTitle>
          <FilterGroup>
            <FilterLabel>Data Inicial</FilterLabel>
            <FilterInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FilterGroup>
          <FilterGroup>
            <FilterLabel>Data Final</FilterLabel>
            <FilterInput
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FilterGroup>
        </SidebarSection>

        <SidebarSection>
          <SectionTitle>Filtros por Agente</SectionTitle>
          <FilterGroup>
            <FilterLabel>Agente</FilterLabel>
            <FilterSelect
              multiple
              value={selectedUsers}
              onChange={(e) => setSelectedUsers(Array.from(e.target.selectedOptions, (option) => option.value))}
              style={{ minHeight: '96px' }}
            >
              {filterOptions?.users.map((user) => (
                <option key={user.username} value={user.username}>
                  {user.full_name}
                </option>
              ))}
            </FilterSelect>
          </FilterGroup>
        </SidebarSection>

        <SidebarSection>
          <SectionTitle>Filtros por Localização</SectionTitle>
          <FilterGroup>
            <FilterLabel>Loja</FilterLabel>
            <FilterSelect
              value={selectedLoja}
              onChange={(e) => setSelectedLoja(e.target.value)}
            >
              <option value="">Todas</option>
              {filterOptions?.lojas.map((loja) => (
                <option key={loja} value={loja}>
                  {loja}
                </option>
              ))}
            </FilterSelect>
          </FilterGroup>
          <FilterGroup>
            <FilterLabel>Setor</FilterLabel>
            <FilterSelect
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
            >
              <option value="">Todos</option>
              {filterOptions?.sectors.map((sector) => (
                <option key={sector.code} value={sector.code}>
                  {sector.name}
                </option>
              ))}
            </FilterSelect>
          </FilterGroup>
        </SidebarSection>

        <SidebarSection>
          <SectionTitle>Ações</SectionTitle>
          <PrimaryButton onClick={() => applyFilters()}>
            <IconeNavegacao src="/img/icone/lista.png" alt="" /> Aplicar Filtros
          </PrimaryButton>
          <SecondaryButton onClick={resetFilters}>
            <IconeNavegacao src="/img/icone/libro-abierto.png" alt="" /> Limpar Filtros
          </SecondaryButton>
        </SidebarSection>

        <SidebarSection>
          <SectionTitle>Navegação</SectionTitle>
          <Button 
            onClick={() => {
              setActiveTab('overview');
              setIsSidebarOpen(false);
            }}
            style={{ 
              background: activeTab === 'overview' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: 'white'
            }}
          >
            <IconeNavegacao src="/img/icone/crecimiento.png" alt="" /> Visão Geral
          </Button>
          <Button 
            onClick={() => {
              setActiveTab('tops');
              setIsSidebarOpen(false);
            }}
            style={{ 
              background: activeTab === 'tops' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: 'white'
            }}
          >
            <IconeNavegacao src="/img/icone/trofeo.png" alt="" /> Rankings
          </Button>
          <Button 
            onClick={() => {
              setActiveTab('calls');
              setIsSidebarOpen(false);
            }}
            style={{ 
              background: activeTab === 'calls' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: 'white'
            }}
          >
            <IconeNavegacao src="/img/icone/lista.png" alt="" /> Registros
          </Button>
        </SidebarSection>
      </Sidebar>

      <MainContent sidebarOpen={isSidebarOpen}>
        <Header>
          <div>
            <HeaderTitle>Dashboard de Suporte Técnico</HeaderTitle>
            <HeaderSubtitle>
              Agentes conectados: {connectedAgents.length} | Última atualização: {new Date().toLocaleTimeString('pt-BR')}
            </HeaderSubtitle>
            <AgentStrip aria-label="Filtro rápido por agente">
              {filterOptions?.users.map((user) => {
                const selected = selectedUsers.includes(user.username);
                return (
                  <AgentButton key={user.username} type="button" selected={selected} aria-pressed={selected} onClick={() => toggleAgent(user.username)}>
                    <AgentAvatar selected={selected}>
                      <AgentAvatarImage
                        src={`/img/agents/${encodeURIComponent(user.username)}.jpg`}
                        alt={`Foto de ${user.full_name}`}
                        onError={(event) => {
                          const image = event.currentTarget;
                          if (image.src.toLowerCase().endsWith('.jpg')) image.src = `/img/agents/${encodeURIComponent(user.username)}.png`;
                          else { image.onerror = null; image.src = '/img/agent-placeholder.svg'; }
                        }}
                      />
                    </AgentAvatar>
                    <span>{user.full_name}</span>
                  </AgentButton>
                );
              })}
              {/* <AgentSelectionHint>Clique para selecionar vários agentes.</AgentSelectionHint> */}
            </AgentStrip>
          </div>
        </Header>

        {activeTab === 'overview' && (
          <>
            <OverviewContent>
              <DashboardSection>
                <KPIGrid>
                  <KPICard color="#3b82f6">
                    <KPILabel>Total de Chamadas</KPILabel>
                    <KPIValue>{data?.overall?.total_calls || 0}</KPIValue>
                    <KPIChange>{callPercentage(data?.overall?.total_calls)} · Volume total</KPIChange>
                  </KPICard>
                  <KPICard color="#10b981">
                    <KPILabel>Entrantes Atendidas</KPILabel>
                    <KPIValue>{data?.overall?.entrantes_atendidas || 0}</KPIValue>
                    <KPIChange>Atendidas</KPIChange>
                  </KPICard>
                  <KPICard color="#ef4444">
                    <KPILabel>Entrantes Não Atendidas</KPILabel>
                    <KPIValue>{data?.overall?.entrantes_nao_atendidas || 0}</KPIValue>
                    <KPIChange>Não atendidas</KPIChange>
                  </KPICard>
                  <KPICard color="#f59e0b">
                    <KPILabel>Salientes Atendidas</KPILabel>
                    <KPIValue>{data?.overall?.salientes_atendidas || 0}</KPIValue>
                    <KPIChange>Realizadas</KPIChange>
                  </KPICard>
                  <KPICard color="#8b5cf6">
                    <KPILabel>Duração Média</KPILabel>
                    <KPIValue>{Math.round(data?.overall?.avg_duration || 0)}s</KPIValue>
                    <KPIChange>Média de atendimento</KPIChange>
                  </KPICard>
                </KPIGrid>
              </DashboardSection>

              <DashboardSection>
                <ChartsGrid>
                  <ChartCard>
                    <SectionHeaderRow>
                      <ChartTitle><span style={{ color: '#64d8ff', fontSize: '28px', textShadow: '0 0 14px #64d8ff' }}>▥</span> Chamadas por Agente</ChartTitle>
                      <ChartOrderSelect value={agentOrder} onChange={(event) => setAgentOrder(event.target.value as 'natural' | 'desc' | 'asc')}>
                        <option value="natural">Ordem original</option>
                        <option value="desc">Maior para menor</option>
                        <option value="asc">Menor para maior</option>
                      </ChartOrderSelect>
                    </SectionHeaderRow>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={agentChartData} barGap={6}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                        <XAxis dataKey="agent_full_name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid rgba(96,165,250,0.25)',
                            borderRadius: '10px',
                            color: '#e2e8f0',
                            boxShadow: '0 14px 30px rgba(15,23,42,0.35)'
                          }}
                        />
                        <Legend wrapperStyle={{ paddingTop: 16, fontSize: '12px' }} />
                        <Bar dataKey="entrantes_atendidas" fill="#10b981" name="Entrantes Atendidas" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="salientes_atendidas" fill="#f59e0b" name="Salientes Atendidas" radius={[6, 6, 0, 0]} />
                        <Line type="monotone" dataKey="entrantes_nao_atendidas" stroke="#ef4444" strokeWidth={2.6} strokeDasharray="4 5" dot={{ r: 4, strokeWidth: 2 }} name="Entrantes Não Atendidas" />
                        <Line type="monotone" dataKey="salientes_nao_atendidas" stroke="#8b5cf6" strokeWidth={2.6} strokeDasharray="4 5" dot={{ r: 4, strokeWidth: 2 }} name="Salientes Não Atendidas" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard>
                    <SectionHeaderRow>
                      <ChartTitle><span style={{ color: '#ff6b9d', fontSize: '28px', textShadow: '0 0 14px #ff6b9d' }}>⌖</span> Ranking por cidade</ChartTitle>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ChartOrderSelect value={cityOrder} onChange={(e) => setCityOrder(e.target.value as 'desc' | 'asc')}>
                          <option value="desc">Maior para menor</option>
                          <option value="asc">Menor para maior</option>
                        </ChartOrderSelect>
                      </div>
                    </SectionHeaderRow>

                    {/*<div style={{ color: '#64748b', marginBottom: '18px', fontSize: '13px' }}>
                      Top cidades por volume e taxa de atendimentos. Clique para ver lojas.
                    </div>*/}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '300px' }}>
                      {cityMapData.length > 0 ? cityMapData.slice(0, 6).map((city, index) => {
                        const maxCalls = cityMapData[0]?.totalCalls || 1;
                        const barWidth = Math.max((city.totalCalls / maxCalls) * 100, 10);
                        const isExpanded = expandedCity === city.city;

                        // Aggregate stores for this city
                        const source = filteredCalls.length > 0 ? filteredCalls : lojaStats;
                        const storesMap: Record<string, { loja: string; totalCalls: number; atendidas: number }> = {};
                        source.forEach((item: any) => {
                          const resolvedCity = item.location_city || item.cidade || item.city || 'Cidade não identificada';
                          const cityName = String(resolvedCity || 'Cidade não identificada').trim();
                          if (cityName !== city.city) return;
                          const lojaRef = item.loja ?? item.store ?? item.location_loja ?? 'Loja não identificada';
                          const lojaKey = String(lojaRef);
                          if (!storesMap[lojaKey]) storesMap[lojaKey] = { loja: lojaKey, totalCalls: 0, atendidas: 0 };
                          const totalCallsValue = Number(item.total_calls ?? item.calls ?? 1);
                          const attendedValue = Number(item.entrantes_atendidas ?? (item.duration !== undefined && Number(item.duration) > 0 ? 1 : 0));
                          storesMap[lojaKey].totalCalls += Number.isFinite(totalCallsValue) ? totalCallsValue : 1;
                          storesMap[lojaKey].atendidas += Number.isFinite(attendedValue) ? attendedValue : 0;
                        });
                        const storesData = Object.values(storesMap).sort((a, b) => b.totalCalls - a.totalCalls);

                        return (
                          <div key={city.city} style={{ padding: '10px 12px', borderRadius: '12px', background: '#f8fbff', border: '1px solid rgba(59,130,246,0.12)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', cursor: 'pointer' }} onClick={() => setExpandedCity(isExpanded ? null : city.city)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '12px' }}>
                                  {index + 1}
                                </div>
                                <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {city.city}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ fontWeight: 700, color: '#10b981', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                  {city.atendidas} atendidas
                                </div>
                                <div style={{ fontSize: 12, color: '#475569' }}>{isExpanded ? 'Ocultar' : 'Ver lojas'}</div>
                              </div>
                            </div>
                            <div style={{ height: '10px', background: '#dfeafc', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ width: `${barWidth}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)', borderRadius: '999px' }} />
                            </div>
                            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                              <span>{city.totalCalls} chamadas</span>
                              <span>{city.stores.length} lojas</span>
                            </div>

                            {isExpanded && (
                              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {storesData.length > 0 ? storesData.map((s) => {
                                  const maxStoreCalls = storesData[0]?.totalCalls || 1;
                                  const storeBar = Math.max((s.totalCalls / maxStoreCalls) * 100, 6);
                                  return (
                                    <div key={s.loja} style={{ padding: '8px', borderRadius: 8, background: 'white', border: '1px solid rgba(15,23,42,0.06)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>Loja {s.loja}</div>
                                        <div style={{ fontSize: 13, color: '#10b981' }}>{s.atendidas} atendidas</div>
                                      </div>
                                      <div style={{ height: 8, background: '#eef2ff', borderRadius: 999, overflow: 'hidden' }}>
                                        <div style={{ width: `${storeBar}%`, height: '100%', background: 'linear-gradient(90deg,#3b82f6,#10b981)' }} />
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{s.totalCalls} chamadas</span>
                                      </div>
                                    </div>
                                  );
                                }) : (
                                  <div style={{ color: '#64748b', fontSize: 13 }}>Nenhuma loja encontrada para esta cidade.</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }) : (
                        <div style={{ display: 'grid', placeItems: 'center', minHeight: '220px', color: '#64748b', textAlign: 'center' }}>
                          Sem dados de cidade para exibir.
                        </div>
                      )}
                    </div>
                  </ChartCard>
                </ChartsGrid>
              </DashboardSection>

              <DashboardSection>
                <ChartCard>
                  <SectionHeaderRow>
                    <ChartTitle><span style={{ color: '#ffd166', fontSize: '28px', textShadow: '0 0 14px #ffd166' }}>◷</span> Horários com mais chamadas</ChartTitle>
                    <ChartActions>
                      <ChartActionButton active={hourlyView === 'general'} onClick={() => setHourlyView('general')}>Geral</ChartActionButton>
                      <ChartActionButton active={hourlyView === 'incoming'} onClick={() => setHourlyView('incoming')}>Recebidas</ChartActionButton>
                      <ChartActionButton active={hourlyView === 'outgoing'} onClick={() => setHourlyView('outgoing')}>Realizadas</ChartActionButton>
                      <ChartActionButton active={hourlyOrder === 'natural'} onClick={() => setHourlyOrder('natural')}>Horário natural</ChartActionButton>
                      <ChartActionButton active={hourlyOrder === 'desc'} onClick={() => setHourlyOrder('desc')}>Maior para menor</ChartActionButton>
                      <ChartActionButton active={hourlyOrder === 'asc'} onClick={() => setHourlyOrder('asc')}>Menor para maior</ChartActionButton>
                    </ChartActions>
                  </SectionHeaderRow>
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={hourlyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="hour" stroke="#64748b" fontSize={11} interval={0} angle={-45} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="atendidas" stackId="a" fill="#10b981" name="Atendidas" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="nao_atendidas" stroke="#ef4444" strokeWidth={2.5} strokeDasharray="2 7" dot={{ r: 4 }} name="Não Atendidas" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <ChartPeriod>{periodLabel}</ChartPeriod>
                </ChartCard>
              </DashboardSection>
            </OverviewContent>
          </>
        )}

        {activeTab === 'tops' && (
          <>
            <DashboardSection>
              <TopList>
                <ChartTitle>Top Lojas com mais atendimentos</ChartTitle>
                {[...lojaStats].sort((a, b) => (b.entrantes_atendidas || 0) - (a.entrantes_atendidas || 0)).slice(0, 5).map((loja, index) => (
                  <TopItem key={loja.loja}>
                    <TopRank rank={index + 1 as number}>{index + 1}</TopRank>
                    <TopInfo>
                      <TopName>Loja {loja.loja}{(loja.location_city || loja.cidade) ? `, ${loja.location_city || loja.cidade}` : ""}</TopName>
                      <TopMetric>Entrantes atendidas</TopMetric>
                    </TopInfo>
                    <TopValue>{loja.entrantes_atendidas || 0}</TopValue>
                  </TopItem>
                ))}
                {lojaStats.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                    Não há dados de lojas disponíveis
                  </div>
                )}
              </TopList>
            </DashboardSection>

            <ChartsGrid>
              <TopList>
                <ChartTitle><IconeTitulo src="/img/icone/medalla.png" alt="" />Top 5 Agentes mais ativos</ChartTitle>
                {topPerformers.topAgents.map((item, index) => (
                  <TopItem key={index}>
                    <TopRank rank={index + 1 as number}>{index + 1}</TopRank>
                    <TopInfo>
                      <TopName>{item.name}</TopName>
                      <TopMetric>{item.metric}</TopMetric>
                    </TopInfo>
                    <TopValue>{item.value}</TopValue>
                  </TopItem>
                ))}
                {topPerformers.topAgents.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                    Não há dados disponíveis
                  </div>
                )}
              </TopList>

              <TopList>
                <ChartTitle><IconeTitulo src="/img/icone/corona.png" alt="" /> Top 5 Agentes com mais entrantes atendidas</ChartTitle>
                {topPerformers.topAtendidas.map((item, index) => (
                  <TopItem key={index}>
                    <TopRank rank={index + 1 as number}>{index + 1}</TopRank>
                    <TopInfo>
                      <TopName>{item.name}</TopName>
                      <TopMetric>{item.metric}</TopMetric>
                    </TopInfo>
                    <TopValue>{item.value}</TopValue>
                  </TopItem>
                ))}
              </TopList>

              <TopList>
                <ChartTitle>Top 5 Agentes com mais entrantes não atendidas</ChartTitle>
                {topPerformers.topNaoAtendidas.map((item, index) => (
                  <TopItem key={index}>
                    <TopRank rank={index + 1 as number}>{index + 1}</TopRank>
                    <TopInfo>
                      <TopName>{item.name}</TopName>
                      <TopMetric>{item.metric}</TopMetric>
                    </TopInfo>
                    <TopValue>{item.value}</TopValue>
                  </TopItem>
                ))}
              </TopList>

              <TopList>
                <ChartTitle>Top 5 Agentes com mais salientes atendidas</ChartTitle>
                {topPerformers.topSalientes.map((item, index) => (
                  <TopItem key={index}>
                    <TopRank rank={index + 1 as number}>{index + 1}</TopRank>
                    <TopInfo>
                      <TopName>{item.name}</TopName>
                      <TopMetric>{item.metric}</TopMetric>
                    </TopInfo>
                    <TopValue>{item.value}</TopValue>
                  </TopItem>
                ))}
              </TopList>
            </ChartsGrid>
          </>
        )}

        {activeTab === 'calls' && (
          <>
            {filteredCalls.length > 0 ? (
              <ChartCard>
                <SectionHeaderRow>
                  <ChartTitle>Registros filtrados ({filteredCalls.length})</ChartTitle>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ChartActionButton onClick={exportFilteredCallsCSV}>Exportar CSV</ChartActionButton>
                  </div>
                </SectionHeaderRow>
                <div style={{ overflowX: 'auto' }}>
                  <CallsTable>
                    <thead>
                      <tr>
                        <TableHeader>Data</TableHeader>
                        <TableHeader>Agente</TableHeader>
                        <TableHeader>Número</TableHeader>
                        <TableHeader>Nome</TableHeader>
                        <TableHeader>Loja</TableHeader>
                        <TableHeader>Setor</TableHeader>
                        <TableHeader>Tipo</TableHeader>
                        <TableHeader>Duração</TableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCalls.map((call) => (
                        <TableRow key={call.id}>
                          <TableCell>{new Date(call.formatted_time).toLocaleString()}</TableCell>
                          <TableCell>{call.agent_full_name}</TableCell>
                          <TableCell>{call.number}</TableCell>
                          <TableCell>{call.name || '-'}</TableCell>
                          <TableCell>Loja {call.loja}{call.location_city ? `, ${call.location_city}` : ""}</TableCell>
                          <TableCell>{call.sector_name}</TableCell>
                          <TableCell>{call.type_description}</TableCell>
                          <TableCell>{call.duration}s</TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </CallsTable>
                </div>
              </ChartCard>
            ) : (
              <ChartCard>
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <div style={{ fontSize: '48px', marginBottom: '20px' }}>Dados</div>
                  <h3>Não há registros para exibir</h3>
                  <p>Aplique filtros para ver os dados específicos</p>
                </div>
              </ChartCard>
            )}
          </>
        )}
      </MainContent>
    </DashboardContainer>
  );
};
