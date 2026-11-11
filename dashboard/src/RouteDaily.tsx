import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

interface Store {
  loja: string;
  tipo: string;
  bairro: string;
  cidade: string;
  uf: string;
}

interface Ticket {
  id: number;
  ticket_number: string;
  description: string;
}

interface Visit {
  id: number;
  loja: string;
  cidade: string;
  bairro: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  visit_date: string;
  observations: string;
  status: 'ABERTO' | 'VALIDAR' | 'FINALIZADO';
  validator_name: string | null;
  validator_role: string | null;
  contact_name: string | null;
  validation_observations: string | null;
  validated_at: string | null;
  tickets: Ticket[];
}

interface RouteDay {
  date: string;
  saved: boolean;
  saved_by: string | null;
  saved_at: string | null;
  stores: Array<{ loja: string; added_by: string | null; added_at: string | null }>;
}

interface RouteDashboardData {
  topStores: Array<{ loja: string; visits: number }>;
  averageTime: Array<{ loja: string; average_minutes: number }>;
  cityRanking: Array<{ cidade: string; visits: number }>;
  ticketTotals: { today: number; month: number; year: number };
  monthly: Array<{ date: string; visits: number; tickets: number; minutes: number }>;
  audits: Array<{ created_at: string; username: string; loja: string; action: string }>;
}

interface RouteDailyProps {
  mode: 'route' | 'history';
  serverUrl: string;
}

interface Coordinates {
  lat: number;
  lon: number;
}

const CITY_COORDINATES: Record<string, Coordinates> = {
  'araquari': { lat: -26.375, lon: -48.718 },
  'balneario barra do sul': { lat: -26.455, lon: -48.612 },
  'balneario camboriu': { lat: -26.992, lon: -48.635 },
  'balneario picarras': { lat: -26.763, lon: -48.671 },
  'barra velha': { lat: -26.632, lon: -48.684 },
  'biguacu': { lat: -27.495, lon: -48.655 },
  'blumenau': { lat: -26.919, lon: -49.066 },
  'bombinhas': { lat: -27.138, lon: -48.514 },
  'braco do norte': { lat: -28.275, lon: -49.166 },
  'brusque': { lat: -27.098, lon: -48.917 },
  'camboriu': { lat: -27.025, lon: -48.654 },
  'canelinha': { lat: -27.263, lon: -48.765 },
  'florianopolis': { lat: -27.595, lon: -48.548 },
  'garopaba': { lat: -28.027, lon: -48.619 },
  'gaspar': { lat: -26.932, lon: -48.958 },
  'gov celso ramos': { lat: -27.315, lon: -48.56 },
  'guaramirim': { lat: -26.473, lon: -49.002 },
  'ilhota': { lat: -26.899, lon: -48.826 },
  'imbituba': { lat: -28.24, lon: -48.67 },
  'indaial': { lat: -26.898, lon: -49.231 },
  'itajai': { lat: -26.91, lon: -48.67 },
  'itapema': { lat: -27.09, lon: -48.61 },
  'ituporanga': { lat: -27.41, lon: -49.6 },
  'jaragua do sul': { lat: -26.485, lon: -49.071 },
  'joinville': { lat: -26.305, lon: -48.846 },
  'laguna': { lat: -28.482, lon: -48.78 },
  'navegantes': { lat: -26.894, lon: -48.654 },
  'palhoca': { lat: -27.645, lon: -48.667 },
  'penha': { lat: -26.77, lon: -48.645 },
  'pomerode': { lat: -26.739, lon: -49.178 },
  'porto belo': { lat: -27.157, lon: -48.55 },
  'rio negrinho': { lat: -26.255, lon: -49.518 },
  'sao bento do sul': { lat: -26.25, lon: -49.38 },
  'sao francisco do sul': { lat: -26.24, lon: -48.638 },
  'sao joao batista': { lat: -27.278, lon: -48.849 },
  'sao jose': { lat: -27.613, lon: -48.636 },
  'santo amaro da imperatriz': { lat: -27.689, lon: -48.779 },
  'tijucas': { lat: -27.241, lon: -48.63 },
  'timbo': { lat: -26.824, lon: -49.272 },
  'tubarao': { lat: -28.47, lon: -49.007 }
};

const normalizeCity = (city: string) => city
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/,.*$/, '')
  .trim();

const getCoordinates = (city: string): Coordinates =>
  CITY_COORDINATES[normalizeCity(city)] || CITY_COORDINATES.tijucas;

const distanceKm = (from: Coordinates, to: Coordinates) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lon - from.lon);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const optimizeRoute = (stores: Store[]) => {
  const remaining = [...stores];
  const ordered: Store[] = [];
  let current = getCoordinates('Tijucas');

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((store, index) => {
      const distance = distanceKm(current, getCoordinates(store.cidade));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next);
    current = getCoordinates(next.cidade);
  }

  let previous = getCoordinates('Tijucas');
  const directDistance = ordered.reduce((total, store) => {
    const next = getCoordinates(store.cidade);
    const legDistance = distanceKm(previous, next);
    previous = next;
    return total + legDistance;
  }, 0);

  return { ordered, estimatedDistance: directDistance * 1.3 };
};

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const localDateTimeInput = (value: string | null | undefined) => {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
};

const currentDateTimeInput = () => {
  const now = new Date();
  return `${localDate()}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';

export const RouteDaily: React.FC<RouteDailyProps> = ({ mode, serverUrl }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [routeDay, setRouteDay] = useState<RouteDay | null>(null);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [storeSearch, setStoreSearch] = useState('');
  const [technician, setTechnician] = useState('');
  const [pendingStore, setPendingStore] = useState<Store | null>(null);
  const [addedBy, setAddedBy] = useState('');
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [observations, setObservations] = useState('');
  const [validatorName, setValidatorName] = useState('');
  const [validatorRole, setValidatorRole] = useState('');
  const [validationObservations, setValidationObservations] = useState('');
  const [validationTime, setValidationTime] = useState(currentDateTimeInput());
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [dashboard, setDashboard] = useState<RouteDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apiRequest = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${serverUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers }
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(body.error || `Error HTTP ${response.status}`);
    return body;
  };

  const refreshVisits = async (date = selectedDate) => {
    const data: Visit[] = await apiRequest(`/api/route/visits?date=${date}`);
    setVisits(data);
    return data;
  };

  const refreshRouteDate = async (date: string) => {
    const [day, visitData]: [RouteDay, Visit[]] = await Promise.all([
      apiRequest(`/api/route/days/${date}`),
      apiRequest(`/api/route/visits?date=${date}`)
    ]);
    setRouteDay(day);
    setVisits(visitData);
    setSelectedStores(day.saved
      ? day.stores.map((item) => item.loja)
      : Array.from(new Set(visitData.map((visit) => visit.loja))));
  };

  const refreshDashboard = async () => {
    const data: RouteDashboardData = await apiRequest('/api/route/dashboard');
    setDashboard(data);
  };

  useEffect(() => {
    try {
      setTechnician(window.localStorage.getItem('route-technician') || '');
    } catch (storageError) {
      console.warn('Não foi possível ler o nome salvo do responsável pela rota:', storageError);
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (mode === 'route') {
          const [storeData] = await Promise.all([
            apiRequest('/api/route/stores'),
            refreshRouteDate(selectedDate)
          ]);
          setStores(storeData);
        } else {
          await refreshDashboard();
        }
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [mode, serverUrl, selectedDate]);

  const visitByStore = useMemo(
    () => new Map(visits.map((visit) => [visit.loja, visit])),
    [visits]
  );
  const filteredStores = useMemo(() => {
    const search = storeSearch.trim().toLowerCase();
    return stores.filter((store) => !search
      || store.loja.includes(search)
      || store.cidade.toLowerCase().includes(search)
      || store.bairro.toLowerCase().includes(search));
  }, [stores, storeSearch]);
  const selectedRoute = useMemo(() => {
    const selected = stores.filter((store) => selectedStores.includes(store.loja));
    return optimizeRoute(selected);
  }, [stores, selectedStores]);
  const ticketsToday = visits.reduce((total, visit) => total + visit.tickets.length, 0);

  const setTechnicianName = (value: string) => {
    setTechnician(value);
    try {
      window.localStorage.setItem('route-technician', value);
    } catch (storageError) {
      console.warn('Não foi possível salvar o nome do responsável pela rota:', storageError);
    }
  };

  const toggleStore = async (store: Store) => {
    if (selectedStores.includes(store.loja)) {
      if (routeDay?.saved) {
        if (!technician.trim()) {
          setError('Informe o responsável pela rota antes de remover uma loja.');
          return;
        }
        setSaving(true);
        setError('');
        try {
          await apiRequest(`/api/route/days/${selectedDate}/stores/${encodeURIComponent(store.loja)}`, {
            method: 'DELETE',
            body: JSON.stringify({ username: technician.trim() })
          });
          await refreshRouteDate(selectedDate);
        } catch (removeError) {
          setError(errorMessage(removeError));
        } finally {
          setSaving(false);
        }
      } else {
        setSelectedStores((current) => current.filter((selected) => selected !== store.loja));
      }
      return;
    }

    if (routeDay?.saved) {
      setPendingStore(store);
      setAddedBy('');
    } else {
      setSelectedStores((current) => [...current, store.loja]);
    }
  };

  const saveDailyRoute = async () => {
    if (!technician.trim()) {
      setError('Informe o responsável pela rota antes de salvá-la.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/route/days/${selectedDate}`, {
        method: 'POST',
        body: JSON.stringify({ username: technician.trim(), stores: selectedStores })
      });
      await refreshRouteDate(selectedDate);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const addStoreToSavedRoute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingStore || !addedBy.trim()) {
      setError('Informe o nome de quem está adicionando a loja.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/route/days/${selectedDate}/stores`, {
        method: 'POST',
        body: JSON.stringify({ loja: pendingStore.loja, username: addedBy.trim() })
      });
      await refreshRouteDate(selectedDate);
      setPendingStore(null);
      setAddedBy('');
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setSaving(false);
    }
  };

  const openVisit = async (store: Store) => {
    setError('');
    setSaving(true);
    try {
      const currentVisit = visitByStore.get(store.loja);
      let visit: Visit;
      if (currentVisit) {
        visit = currentVisit;
      } else {
        if (!technician.trim()) throw new Error('Informe o responsável pela rota antes de iniciar o atendimento.');
        visit = await apiRequest('/api/route/visits', {
          method: 'POST',
          body: JSON.stringify({ loja: store.loja, username: technician.trim(), visit_date: selectedDate })
        });
      }
      const updatedVisits = await refreshVisits(selectedDate);
      const refreshedVisit = updatedVisits.find((item) => item.id === visit.id);
      const visitWithTickets = refreshedVisit || { ...visit, tickets: visit.tickets || [] };
      setActiveVisit(visitWithTickets);
      setArrivalTime(localDateTimeInput(visitWithTickets.start_time));
      setDepartureTime(localDateTimeInput(visitWithTickets.end_time));
      setObservations(visitWithTickets.observations || '');
      setValidatorName(visitWithTickets.validator_name || '');
      setValidatorRole(visitWithTickets.validator_role || '');
      setValidationObservations(visitWithTickets.validation_observations || '');
      setValidationTime(localDateTimeInput(visitWithTickets.validated_at) || currentDateTimeInput());
      setTicketNumber('');
      setTicketDescription('');
    } catch (openError) {
      setError(errorMessage(openError));
      if (errorMessage(openError).includes('atendimento em andamento')) await refreshVisits(selectedDate);
    } finally {
      setSaving(false);
    }
  };

  const saveVisit = async (action: 'SAVE' | 'VALIDAR' | 'FINALIZADO' | 'VALIDATE') => {
    if (!activeVisit || (action !== 'VALIDATE' && !technician.trim())) {
      setError('Informe o responsável pela rota antes de salvar.');
      return;
    }
    if (action === 'VALIDATE' && (!validatorName.trim() || !validatorRole.trim() || !validationTime)) {
      setError('Informe o nome, a função e a data e hora da validação.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (action === 'VALIDATE') {
        await apiRequest(`/api/route/visits/${activeVisit.id}/validate`, {
          method: 'POST',
          body: JSON.stringify({
            validator_name: validatorName.trim(),
            validator_role: validatorRole.trim(),
            validation_observations: validationObservations.trim(),
            validated_at: validationTime
          })
        });
      } else {
        const completes = action === 'VALIDAR' || action === 'FINALIZADO';
        await apiRequest(`/api/route/visits/${activeVisit.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            username: technician.trim(),
            start_time: arrivalTime,
            end_time: completes ? departureTime || currentDateTimeInput() : departureTime,
            observations,
            status: completes ? action : undefined,
            complete: completes
          })
        });
      }
      await refreshVisits(selectedDate);
      if (action !== 'SAVE') setActiveVisit(null);
      else setActiveVisit((current) => current ? { ...current, observations } : current);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const addTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeVisit || !technician.trim()) {
      setError('Informe o responsável pela rota antes de adicionar um chamado.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/route/visits/${activeVisit.id}/tickets`, {
        method: 'POST',
        body: JSON.stringify({
          ticket_number: ticketNumber,
          description: ticketDescription,
          username: technician.trim()
        })
      });
      const updatedVisits = await refreshVisits(selectedDate);
      setActiveVisit(updatedVisits.find((visit) => visit.id === activeVisit.id) || activeVisit);
      setTicketNumber('');
      setTicketDescription('');
      await refreshDashboard();
    } catch (ticketError) {
      setError(errorMessage(ticketError));
    } finally {
      setSaving(false);
    }
  };

  const monthlySeries = useMemo(() => {
    if (!dashboard) return [];
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const valuesByDate = new Map(dashboard.monthly.map((item) => [item.date, item]));
    return Array.from({ length: now.getDate() }, (_, index) => {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const value = valuesByDate.get(dateKey);
      return {
        day: String(index + 1).padStart(2, '0'),
        visits: Number(value?.visits || 0),
        tickets: Number(value?.tickets || 0),
        minutes: Number(value?.minutes || 0)
      };
    });
  }, [dashboard]);

  if (loading) return <section className="route-page"><p className="route-muted">Cargando...</p></section>;

  if (mode === 'route') {
    return (
      <section className="route-page">
        <div className="route-heading">
          <div>
            <p className="route-eyebrow">Planejamento de suporte</p>
            <h2>Rota diária</h2>
            <p>Origem fixa: Tijucas - SC - Brasil</p>
          </div>
          <label className="route-technician">
            Responsável pela rota
            <input value={technician} onChange={(event) => setTechnicianName(event.target.value)} placeholder="Nome do responsável" />
          </label>
        </div>

        {error && <div className="route-error" role="alert">{error}</div>}

        <div className="route-layout">
          <aside className="route-picker">
            <div className="route-day-selector">
              <label htmlFor="route-date">Dia da rota</label>
              <input
                id="route-date"
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setRouteDay(null);
                  setSelectedStores([]);
                  setVisits([]);
                  setLoading(true);
                  setSelectedDate(event.target.value);
                }}
              />
            </div>
            <h3>Selecionar lojas</h3>
            <input
              className="route-search"
              type="search"
              value={storeSearch}
              onChange={(event) => setStoreSearch(event.target.value)}
              placeholder="Buscar loja, cidade ou bairro"
            />
            <div className="route-store-list">
              {filteredStores.map((store) => (
                <label key={store.loja} className="route-store-option">
                  <input
                    type="checkbox"
                    checked={selectedStores.includes(store.loja)}
                    disabled={saving}
                    onChange={() => void toggleStore(store)}
                  />
                  <span><strong>Loja {store.loja}</strong><small>{store.cidade} · {store.bairro}</small></span>
                </label>
              ))}
              {filteredStores.length === 0 && <p className="route-muted">Nenhuma loja encontrada.</p>}
            </div>
            <p className="route-muted">{selectedStores.length} loja(s) selecionada(s)</p>
            <div className="route-selected-stores">
              <h3>Lojas na rota</h3>
              {selectedStores.map((loja) => {
                const store = stores.find((item) => item.loja === loja);
                const routeStore = routeDay?.stores.find((item) => item.loja === loja);
                return (
                  <div className="route-selected-store" key={loja}>
                    <span>
                      <strong>Loja {loja}</strong>
                      <small>{store ? `${store.cidade} · ${store.bairro}` : 'Localidade não disponível'}</small>
                      {routeStore?.added_by && <small>Adicionada por {routeStore.added_by} às {routeStore.added_at}</small>}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover loja ${loja} da rota`}
                      disabled={saving}
                      onClick={() => store && void toggleStore(store)}
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
              {selectedStores.length === 0 && <p className="route-muted">Nenhuma loja selecionada para este dia.</p>}
            </div>
          </aside>

          <div className="route-content">
            <div className="route-day-save">
              <div>
                <strong>{routeDay?.saved ? 'Rota do dia salva' : 'Rota ainda não salva'}</strong>
                {routeDay?.saved && <small>Salva por {routeDay.saved_by} em {routeDay.saved_at}</small>}
              </div>
              <button
                className="route-secondary-button"
                type="button"
                disabled={saving || Boolean(routeDay?.saved)}
                onClick={() => void saveDailyRoute()}
              >
                {routeDay?.saved ? 'Dia salvo' : 'Salvar rota do dia'}
              </button>
            </div>
            <div className="route-summary">
              <article><span>Distância total estimada</span><strong>{selectedRoute.estimatedDistance.toFixed(1)} km</strong></article>
              <article><span>Tempo estimado de deslocamento</span><strong>{Math.ceil(selectedRoute.estimatedDistance / 55 * 60)} min</strong></article>
              <article><span>Lojas na rota</span><strong>{selectedRoute.ordered.length}</strong></article>
              <article><span>Chamados registrados no dia</span><strong>{ticketsToday}</strong></article>
            </div>
            <p className="route-disclaimer">Ordem por proximidade usando centros urbanos e distância geográfica; os valores são aproximados e não consideram o trânsito nem a malha viária.</p>

            <div className="route-stops">
              {selectedRoute.ordered.map((store, index) => {
                const visit = visitByStore.get(store.loja);
                const status = visit?.status || (visit?.end_time ? 'FINALIZADO' : 'ABERTO');
                const pendingValidation = status === 'VALIDAR';
                const finalized = status === 'FINALIZADO';
                return (
                  <article className={`route-card ${finalized ? 'is-completed' : ''} ${pendingValidation ? 'is-pending-validation' : ''}`} key={store.loja}>
                    <div className="route-card-order">{index + 1}</div>
                    <div className="route-card-content">
                      <strong>Loja {store.loja}</strong>
                      <span>{store.cidade} - {store.uf}</span>
                      <small>{store.bairro} · {store.tipo}</small>
                      <span className="route-status">{status}</span>
                      {visit && <small>{visit.tickets.length} chamado(s) · {visit.duration_minutes ?? '—'} min</small>}
                    </div>
                    <button
                      className={pendingValidation
                        ? 'route-validate-button'
                        : `route-visit-button ${finalized ? 'is-completed' : ''}`}
                      type="button"
                      disabled={saving || finalized}
                      onClick={() => void openVisit(store)}
                    >
                      {pendingValidation ? 'Validar' : finalized ? 'Finalizado' : visit ? 'Continuar' : 'Aberto'}
                    </button>
                  </article>
                );
              })}
              {selectedRoute.ordered.length === 0 && (
                <div className="route-empty">Selecione uma ou mais lojas para calcular a rota.</div>
              )}
            </div>
          </div>
        </div>

        {activeVisit && (
          <div className="route-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveVisit(null);
          }}>
            <section className="route-modal" role="dialog" aria-modal="true" aria-labelledby="route-modal-title">
              <div className="route-modal-heading">
                <div><p className="route-eyebrow">Registro de atendimento</p><h2 id="route-modal-title">Loja {activeVisit.loja} · {activeVisit.cidade}</h2></div>
                <button type="button" className="route-close" aria-label="Fechar" onClick={() => setActiveVisit(null)}>×</button>
              </div>
              <p className={`route-visit-state is-${activeVisit.status.toLowerCase()}`}>{activeVisit.status}</p>
              <div className="route-modal-fields">
                <label>Data e hora de chegada<input type="datetime-local" value={arrivalTime} disabled={Boolean(activeVisit.end_time)} onChange={(event) => setArrivalTime(event.target.value)} /></label>
                <label>Data e hora de saída<input type="datetime-local" value={departureTime} disabled={Boolean(activeVisit.end_time)} onChange={(event) => setDepartureTime(event.target.value)} /></label>
              </div>
              <label className="route-field">Observações<textarea rows={3} value={observations} disabled={Boolean(activeVisit.end_time)} onChange={(event) => setObservations(event.target.value)} placeholder="Anotações sobre o atendimento" /></label>
              <div className="route-ticket-section">
                <div className="route-section-heading"><h3>Chamados</h3><span>Chamados registrados: {activeVisit.tickets.length}</span></div>
                <ul className="route-ticket-list">
                  {activeVisit.tickets.map((ticket) => <li key={ticket.id}><strong>Chamado {ticket.ticket_number}</strong><span>{ticket.description}</span></li>)}
                  {activeVisit.tickets.length === 0 && <li className="route-muted">Nenhum chamado registrado.</li>}
                </ul>
                {!activeVisit.end_time && (
                  <form className="route-ticket-form" onSubmit={(event) => void addTicket(event)}>
                    <input value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="Número do chamado" required />
                    <input value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} placeholder="Descrição" required />
                    <button type="submit" disabled={saving}>Adicionar chamado</button>
                  </form>
                )}
              </div>
              {activeVisit.status === 'VALIDAR' ? (
                <div className="route-validation-section">
                  <h3>Dados da validação</h3>
                  <div className="route-validation-fields">
                    <label>Nome de quem validou
                      <input value={validatorName} onChange={(event) => setValidatorName(event.target.value)} placeholder="Nome do atendente ou funcionário" required />
                    </label>
                    <label>Cargo ou função
                      <input value={validatorRole} onChange={(event) => setValidatorRole(event.target.value)} placeholder="Ex.: gerente da loja" required />
                    </label>
                    <label>Data e hora da validação
                      <input type="datetime-local" value={validationTime} onChange={(event) => setValidationTime(event.target.value)} required />
                    </label>
                    <label>Observações (opcional)
                      <textarea rows={2} value={validationObservations} onChange={(event) => setValidationObservations(event.target.value)} />
                    </label>
                  </div>
                </div>
              ) : activeVisit.validated_at ? (
                <p className="route-validation-info">
                  Validado por {activeVisit.validator_name} ({activeVisit.validator_role}) em {activeVisit.validated_at}.
                  {activeVisit.validation_observations && <><br />Observações: {activeVisit.validation_observations}</>}
                </p>
              ) : null}
              {error && <div className="route-error" role="alert">{error}</div>}
              <div className="route-modal-actions">
                {activeVisit.status === 'ABERTO' && (
                  <>
                    <button type="button" className="route-secondary-button" disabled={saving} onClick={() => void saveVisit('SAVE')}>Salvar alterações</button>
                    <button type="button" className="route-finish-button" disabled={saving} onClick={() => void saveVisit('FINALIZADO')}>Finalizar</button>
                    <button type="button" className="route-validate-button" disabled={saving} onClick={() => void saveVisit('VALIDAR')}>Validar</button>
                  </>
                )}
                {activeVisit.status === 'VALIDAR' && (
                  <button type="button" className="route-validate-button" disabled={saving} onClick={() => void saveVisit('VALIDATE')}>Confirmar validação</button>
                )}
              </div>
            </section>
          </div>
        )}
        {pendingStore && (
          <div className="route-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setPendingStore(null);
          }}>
            <section className="route-modal route-add-store-modal" role="dialog" aria-modal="true" aria-labelledby="add-store-title">
              <div className="route-modal-heading">
                <div><p className="route-eyebrow">Alteração da rota salva</p><h2 id="add-store-title">Adicionar Loja {pendingStore.loja}</h2></div>
                <button type="button" className="route-close" aria-label="Fechar" disabled={saving} onClick={() => setPendingStore(null)}>×</button>
              </div>
              <p className="route-muted">A inclusão será registrada com a data e o horário do salvamento.</p>
              <form onSubmit={(event) => void addStoreToSavedRoute(event)}>
                <label className="route-field">Nome de quem está adicionando
                  <input autoFocus value={addedBy} onChange={(event) => setAddedBy(event.target.value)} required />
                </label>
                {error && <div className="route-error" role="alert">{error}</div>}
                <div className="route-modal-actions">
                  <button type="button" className="route-secondary-button" disabled={saving} onClick={() => setPendingStore(null)}>Cancelar</button>
                  <button type="submit" className="route-secondary-button" disabled={saving}>Adicionar loja</button>
                </div>
              </form>
            </section>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="route-page">
      <div className="route-heading">
        <div><p className="route-eyebrow">Resultados e histórico</p><h2>Painel de atendimentos</h2></div>
        <button className="route-secondary-button" type="button" onClick={() => {
          setLoading(true);
          void refreshDashboard().then(() => setError('')).catch((refreshError) => setError(errorMessage(refreshError))).finally(() => setLoading(false));
        }}>Atualizar</button>
      </div>
      {error && <div className="route-error" role="alert">{error}</div>}
      {!dashboard && <p className="route-muted">Não há dados de atendimentos disponíveis.</p>}
      {dashboard && (
        <>
          <div className="route-summary route-history-summary">
            <article><span>Chamados hoje</span><strong>{dashboard.ticketTotals.today || 0}</strong></article>
            <article><span>Chamados neste mês</span><strong>{dashboard.ticketTotals.month || 0}</strong></article>
            <article><span>Chamados neste ano</span><strong>{dashboard.ticketTotals.year || 0}</strong></article>
            <article><span>Cidades atendidas</span><strong>{dashboard.cityRanking.length}</strong></article>
          </div>
          <div className="route-history-grid">
            <article className="route-panel">
              <h3>Lojas mais atendidas</h3>
              {dashboard.topStores.map((item) => <div className="route-ranking-row" key={item.loja}><span>Loja {item.loja}</span><strong>{item.visits} atendimentos</strong></div>)}
              {dashboard.topStores.length === 0 && <p className="route-muted">Nenhum atendimento registrado.</p>}
            </article>
            <article className="route-panel">
              <h3>Tempo médio por loja</h3>
              {dashboard.averageTime.map((item) => <div className="route-ranking-row" key={item.loja}><span>Loja {item.loja}</span><strong>{item.average_minutes} min</strong></div>)}
              {dashboard.averageTime.length === 0 && <p className="route-muted">Nenhum atendimento concluído.</p>}
            </article>
            <article className="route-panel">
              <h3>Ranking de cidades</h3>
              {dashboard.cityRanking.map((item, index) => <div className="route-ranking-row" key={item.cidade}><span>{index + 1}. {item.cidade}</span><strong>{item.visits} atendimentos</strong></div>)}
              {dashboard.cityRanking.length === 0 && <p className="route-muted">Nenhum atendimento registrado.</p>}
            </article>
          </div>
          <article className="route-panel route-monthly-panel">
            <h3>Atividade diária deste mês</h3>
            <div className="route-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#29384d" />
                  <XAxis dataKey="day" stroke="#9fb0c6" />
                  <YAxis yAxisId="count" stroke="#9fb0c6" />
                  <YAxis yAxisId="minutes" orientation="right" stroke="#9fb0c6" />
                  <Tooltip contentStyle={{ background: '#101c2c', border: '1px solid #334155', color: '#e2e8f0' }} />
                  <Legend />
                  <Bar yAxisId="count" dataKey="visits" name="Atendimentos" fill="#38bdf8" />
                  <Bar yAxisId="count" dataKey="tickets" name="Chamados" fill="#a78bfa" />
                  <Bar yAxisId="minutes" dataKey="minutes" name="Minutos" fill="#34d399" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="route-panel route-audit-panel">
            <h3>Auditoria recente</h3>
            <div className="route-audit-table-wrap">
              <table className="route-audit-table">
                <thead><tr><th>Data e hora</th><th>Usuário</th><th>Loja</th><th>Ação</th></tr></thead>
                <tbody>
                  {dashboard.audits.map((item, index) => <tr key={`${item.created_at}-${index}`}><td>{item.created_at}</td><td>{item.username}</td><td>Loja {item.loja}</td><td>{item.action}</td></tr>)}
                  {dashboard.audits.length === 0 && <tr><td colSpan={4}>Nenhuma ação auditada.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
};
