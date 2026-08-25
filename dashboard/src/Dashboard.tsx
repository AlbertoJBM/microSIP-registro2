// dashboard/src/Dashboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
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
  background: #f5f5f5;
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

  @media (min-width: 1024px) {
    transform: translateX(0);
  }
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

const MenuButton = styled.button`
  display: none;
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1001;
  background: #1e3a8a;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  font-size: 20px;

  @media (max-width: 1023px) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
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
  margin-bottom: 15px;
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
  background: white;
  color: #334155;
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

const MainContent = styled.div`
  flex: 1;
  margin-left: 0;
  padding: 30px;
  padding-top: 80px;

  @media (min-width: 1024px) {
    margin-left: 280px;
    padding-top: 30px;
  }
`;

const Header = styled.div`
  background: white;
  padding: 25px 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  margin-bottom: 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const HeaderTitle = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
`;

const HeaderSubtitle = styled.p`
  color: #64748b;
  margin: 5px 0 0 0;
  font-size: 14px;
`;

const KPIGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 25px;
`;

const KPICard = styled.div<{ color?: string }>`
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border-left: 4px solid ${props => props.color || '#3b82f6'};
`;

const KPIValue = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 8px 0;
`;

const KPILabel = styled.div`
  font-size: 12px;
  color: #64748b;
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
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
`;

const ChartTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
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
  color: #64748b;
  font-size: 12px;
  margin-top: 12px;
  text-align: left;
`;

const TopList = styled.div`
  background: white;
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
  color: #1e293b;
  font-size: 14px;
`;

const TopValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: #3b82f6;
`;

const TopMetric = styled.div`
  font-size: 12px;
  color: #64748b;
`;
//----------------------------------------------------------------variable de colores-----------------------------------//
//const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const CallsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: white;
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
  color: #334155;
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

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedLoja, setSelectedLoja] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [hourlyView, setHourlyView] = useState<HourlyView>('general');
  const [hourlyOrder, setHourlyOrder] = useState<'natural' | 'desc' | 'asc'>('natural');
  const [agentOrder, setAgentOrder] = useState<'natural' | 'desc' | 'asc'>('natural');
  const [activeTab, setActiveTab] = useState<'overview' | 'calls' | 'tops'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const filterParamsRef = useRef(new URLSearchParams());

  const getFilterParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedUser) params.append('user', selectedUser);
    if (selectedLoja) params.append('loja', selectedLoja);
    if (selectedSector) params.append('sector', selectedSector);
    return params;
  };

  useEffect(() => {
    filterParamsRef.current = getFilterParams();
  }, [startDate, endDate, selectedUser, selectedLoja, selectedSector]);

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

  const applyFilters = async () => {
    try {
      const params = getFilterParams();

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

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedUser('');
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
        <div style={{ fontSize: '48px' }}>⏳</div>
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

  return (
    <DashboardContainer>
      <MenuButton onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        {isSidebarOpen ? '✕' : '☰'}
      </MenuButton>
      
      <Overlay isOpen={isSidebarOpen} onClick={() => setIsSidebarOpen(false)} />
      
      <Sidebar isOpen={isSidebarOpen}>
        <SidebarHeader>
          <SidebarTitle>
            📊 Central de Chamadas
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
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="">Todos</option>
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
          <PrimaryButton onClick={applyFilters}>
            🔍 Aplicar Filtros
          </PrimaryButton>
          <SecondaryButton onClick={resetFilters}>
            🔄 Limpar Filtros
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
            📈 Visão Geral
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
            🏆 Rankings
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
            📋 Registros
          </Button>
        </SidebarSection>
      </Sidebar>

      <MainContent>
        <Header>
          <div>
            <HeaderTitle>Dashboard de Suporte Técnico</HeaderTitle>
            <HeaderSubtitle>
              Agentes conectados: {connectedAgents.length} | Última atualização: {new Date().toLocaleTimeString('pt-BR')}
            </HeaderSubtitle>
          </div>
        </Header>

        {activeTab === 'overview' && (
          <>
            <KPIGrid>
              <KPICard color="#3b82f6">
                <KPILabel>Total de Chamadas</KPILabel>
                <KPIValue>{data?.overall?.total_calls || 0}</KPIValue>
                <KPIChange>Volume total</KPIChange>
              </KPICard>
              <KPICard color="#10b981">
                <KPILabel>Entrantes Atendidas</KPILabel>
                <KPIValue>{data?.overall?.entrantes_atendidas || 0}</KPIValue>
                <KPIChange>✅ Recebidas e atendidas</KPIChange>
              </KPICard>
              <KPICard color="#ef4444">
                <KPILabel>Entrantes Não Atendidas</KPILabel>
                <KPIValue>{data?.overall?.entrantes_nao_atendidas || 0}</KPIValue>
                <KPIChange>❌ Recebidas mas não atendidas</KPIChange>
              </KPICard>
              <KPICard color="#f59e0b">
                <KPILabel>Salientes Atendidas</KPILabel>
                <KPIValue>{data?.overall?.salientes_atendidas || 0}</KPIValue>
                <KPIChange>📤 Realizadas e atendidas</KPIChange>
              </KPICard>
              <KPICard color="#8b5cf6">
                <KPILabel>Duração Média</KPILabel>
                <KPIValue>{Math.round(data?.overall?.avg_duration || 0)}s</KPIValue>
                <KPIChange>⏱️ Média de atendimento</KPIChange>
              </KPICard>
            </KPIGrid>

            <ChartsGrid>
              <ChartCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                  <ChartTitle>📊 Chamadas por Agente</ChartTitle>
                  <ChartOrderSelect value={agentOrder} onChange={(event) => setAgentOrder(event.target.value as 'natural' | 'desc' | 'asc')}>
                    <option value="natural">Ordem original</option>
                    <option value="desc">Maior para menor</option>
                    <option value="asc">Menor para maior</option>
                  </ChartOrderSelect>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />top
                    <XAxis dataKey="agent_full_name" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: 'none', 
                        borderRadius: '8px',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                    <Bar dataKey="entrantes_atendidas" fill="#10b981" name="Entrantes Atendidas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="entrantes_nao_atendidas" fill="#ef4444" name="Entrantes Não Atendidas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="salientes_atendidas" fill="#f59e0b" name="Salientes Atendidas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="salientes_nao_atendidas" fill="#8b5cf6" name="Salientes Não Atendidas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard>
                <ChartTitle>🥧 Distribuição de Chamadas</ChartTitle>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Entrantes Atendidas', value: data?.overall?.entrantes_atendidas || 0 },
                        { name: 'Entrantes Não Atendidas', value: data?.overall?.entrantes_nao_atendidas || 0 },
                        { name: 'Salientes Atendidas', value: data?.overall?.salientes_atendidas || 0 },
                        { name: 'Salientes Não Atendidas', value: data?.overall?.salientes_nao_atendidas || 0 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#8b5cf6" />
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: 'none', 
                        borderRadius: '8px',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </ChartsGrid>

            <ChartCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                <ChartTitle>🕒 Horários com mais chamadas</ChartTitle>
                <ChartActions>
                  <ChartActionButton active={hourlyView === 'general'} onClick={() => setHourlyView('general')}>Geral</ChartActionButton>
                  <ChartActionButton active={hourlyView === 'incoming'} onClick={() => setHourlyView('incoming')}>Recebidas</ChartActionButton>
                  <ChartActionButton active={hourlyView === 'outgoing'} onClick={() => setHourlyView('outgoing')}>Realizadas</ChartActionButton>
                  <ChartActionButton active={hourlyOrder === 'natural'} onClick={() => setHourlyOrder('natural')}>Horário natural</ChartActionButton>
                  <ChartActionButton active={hourlyOrder === 'desc'} onClick={() => setHourlyOrder('desc')}>Maior para menor</ChartActionButton>
                  <ChartActionButton active={hourlyOrder === 'asc'} onClick={() => setHourlyOrder('asc')}>Menor para maior</ChartActionButton>
                </ChartActions>
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={hourlyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={11} interval={0} angle={-45} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="atendidas" stackId="a" fill="#10b981" name="Atendidas" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="nao_atendidas" stackId="a" fill="#ef4444" name="Não Atendidas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <ChartPeriod>{periodLabel}</ChartPeriod>
            </ChartCard>
          </>
        )}

        {activeTab === 'tops' && (
          <>
            <TopList>
              <ChartTitle>🏪 Top Lojas com mais atendimentos</ChartTitle>
              {lojaStats.slice(0, 5).map((loja, index) => (
                <TopItem key={loja.loja}>
                  <TopRank rank={index + 1 as number}>{index + 1}</TopRank>
                  <TopInfo>
                    <TopName>Loja {loja.loja}</TopName>
                    <TopMetric>Atendidas: {loja.entrantes_atendidas} | Não atendidas: {loja.entrantes_nao_atendidas}</TopMetric>
                  </TopInfo>
                  <TopValue>{loja.total_calls}</TopValue>
                </TopItem>
              ))}
              {lojaStats.length === 0 && (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                  Não há dados de lojas disponíveis
                </div>
              )}
            </TopList>

            <ChartsGrid>
              <TopList>
                <ChartTitle>⭐ Top 5 Agentes mais ativos</ChartTitle>
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
                <ChartTitle>✅ Top 5 Agentes com mais entrantes atendidas</ChartTitle>
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
                <ChartTitle>⚠️ Top 5 Agentes com mais entrantes não atendidas</ChartTitle>
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
                <ChartTitle>📤 Top 5 Agentes com mais salientes atendidas</ChartTitle>
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
                <ChartTitle>📋 Registros filtrados ({filteredCalls.length})</ChartTitle>
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
                          <TableCell>{call.loja}</TableCell>
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
                  <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
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