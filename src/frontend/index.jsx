import React, { useEffect, useState, useRef } from 'react';
import ForgeReconciler, { Text, DynamicTable, Textfield, Link, Tabs, TabList, Tab, TabPanel, Button, Stack, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition, Inline, BarChart, PieChart, Checkbox, Select, Spinner, Heading, Lozenge, TextArea } from '@forge/react';
import { invoke } from '@forge/bridge';

const PulseCard = ({ count }) => {
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 800);
    return () => clearInterval(interval);
  }, []);
  return (
    <Stack alignInline="center">
      <Heading as="h2">
        {count > 0 && pulse ? `🚨 ${count} 🚨` : count}
      </Heading>
      <Lozenge appearance={count > 0 && pulse ? "removed" : "default"}>Active Threats</Lozenge>
    </Stack>
  );
};

const FilterField = ({ name, placeholder, value, onChange }) => {
  const [localValue, setLocalValue] = useState(value || "");
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef(value || "");
  const isTypingRef = useRef(false);
  onChangeRef.current = onChange;
  
  // Sync from parent ONLY when it's an external reset (not our own emit bouncing back)
  useEffect(() => {
    const parentVal = value || "";
    if (!isTypingRef.current && parentVal !== lastEmittedRef.current) {
      setLocalValue(parentVal);
      lastEmittedRef.current = parentVal;
    }
  }, [value]);
  
  // Debounced emit to parent — only fires when localValue changes
  useEffect(() => {
    if (localValue === lastEmittedRef.current) return;
    isTypingRef.current = true;
    const t = setTimeout(() => {
      lastEmittedRef.current = localValue;
      isTypingRef.current = false;
      onChangeRef.current(localValue);
    }, 800);
    return () => clearTimeout(t);
  }, [localValue]);

  return <Textfield name={name} placeholder={placeholder} value={localValue} onChange={e => setLocalValue(e.target.value)} />;
};

const AuditLogModal = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      invoke('getAuditLogs').then(res => {
        setLogs(res || []);
        setLoading(false);
      });
    }
  }, [isOpen]);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  const rows = logs.map((log, index) => ({
    key: `row-${index}`,
    cells: [
      { key: `tm-${index}`, content: formatDate(log.value.timestamp) },
      { key: `usr-${index}`, content: log.value.displayName || log.value.accountId },
      { key: `act-${index}`, content: <Lozenge appearance={log.value.action === 'IGNORE' ? 'removed' : 'success'}>{log.value.action}</Lozenge> },
      { key: `cnt-${index}`, content: log.value.count },
      { key: `rep-${index}`, content: log.value.repos },
      { key: `fl-${index}`, content: log.value.files || '-' },
      { key: `rsn-${index}`, content: log.value.reason || '-' }
    ]
  }));

  const head = {
    cells: [
      { key: 'tm', content: 'Time' },
      { key: 'usr', content: 'User' },
      { key: 'act', content: 'Action' },
      { key: 'cnt', content: 'Secrets' },
      { key: 'rep', content: 'Repositories' },
      { key: 'fl', content: 'Files' },
      { key: 'rsn', content: 'Reason' }
    ]
  };

  if (!isOpen) return null;

  return (
    <Modal width="x-large">
      <ModalHeader><ModalTitle>📜 Activity Log</ModalTitle></ModalHeader>
      <ModalBody>
        {loading ? <Spinner size="large" /> : (
          <DynamicTable head={head} rows={rows} emptyView="No activity logs found." />
        )}
      </ModalBody>
      <ModalFooter><Button onClick={onClose}>Close</Button></ModalFooter>
    </Modal>
  );
};

const App = () => {
  const [scans, setScans] = useState(null);
  const [ignoredList, setIgnoredList] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Column Filters
  const [filterTeam, setFilterTeam] = useState("");
  const [filterRepo, setFilterRepo] = useState("");
  const [filterFile, setFilterFile] = useState("");
  const [filterLine, setFilterLine] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterReason, setFilterReason] = useState("");
  // Modal State
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFingerprints, setSelectedFingerprints] = useState([]);
  const [customReason, setCustomReason] = useState("");
  const [showWebhookInfo, setShowWebhookInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  // CSV Export State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvContent, setCsvContent] = useState("");

  const formatDate = (dateObj) => {
    const pad = (n) => n.toString().padStart(2, '0');
    const d = pad(dateObj.getDate());
    const m = pad(dateObj.getMonth() + 1);
    const y = dateObj.getFullYear();
    let hours = dateObj.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const mins = pad(dateObj.getMinutes());
    const secs = pad(dateObj.getSeconds());
    return `${d}-${m}-${y} ${pad(hours)}:${mins}:${secs} ${ampm}`;
  };

  const fetchData = async () => {
    try {
      const resScans = await invoke('getScans');
      setScans(Array.isArray(resScans) ? resScans : []);
      
      const resIgnored = await invoke('getIgnored');
      setIgnoredList(Array.isArray(resIgnored) ? resIgnored : []);
    } catch (err) {
      setError(`Data fetch error: ${err.message || err}`);
    }
  };

  useEffect(() => {
    fetchData();
    invoke('getWebhookUrl')
      .then(setWebhookUrl)
      .catch(err => setError(`getWebhookUrl error: ${err.message || err}`));
  }, []);

  const submitIgnore = async () => {
    if (!customReason || selectedFingerprints.length === 0) return;
    setIsModalOpen(false);
    setIsProcessing(true);
    
    const extractFingerprint = (uid) => {
      const match = activeSecrets.find(s => s.uid === uid);
      return match ? match.fingerprint : uid;
    };
    
    let actualFingerprints;
    if (isAllSelected) {
      actualFingerprints = filteredActive.map(s => s.fingerprint);
    } else {
      actualFingerprints = [...new Set(selectedFingerprints.map(uid => extractFingerprint(uid)))];
    }
    
    const selectedSecrets = activeSecrets.filter(s => actualFingerprints.includes(s.fingerprint));
    const repos = [...new Set(selectedSecrets.map(s => s.repo))];

    await invoke('bulkIgnoreSecrets', { 
      fingerprints: actualFingerprints, 
      reason: customReason,
      details: { 
        count: actualFingerprints.length, 
        repos,
        files: [...new Set(selectedSecrets.map(s => s.file))]
      }
    });
    setCustomReason("");
    setSelectedFingerprints([]);
    setIsAllSelected(false);
    await fetchData();
    setIsProcessing(false);
  };

  const openIgnoreModal = (fingerprints) => {
    setSelectedFingerprints(Array.isArray(fingerprints) ? fingerprints : [fingerprints]);
    setCustomReason("");
    setIsModalOpen(true);
  };

  const toggleSelection = (fingerprint) => {
    setSelectedFingerprints(prev => 
      prev.includes(fingerprint) 
        ? prev.filter(f => f !== fingerprint)
        : [...prev, fingerprint]
    );
  };

  const handleRestore = async (fingerprint, repo, file) => {
    setIsProcessing(true);
    await invoke('restoreSecret', { fingerprint, repo, file });
    await fetchData();
    setIsProcessing(false);
  };

  if (error) return <Text>Error: {error}</Text>;
  if (!scans || !ignoredList) return <Text>Loading dashboard...</Text>;
  if (isProcessing) return (
    <Stack space="space.400" alignInline="center">
      <Spinner size="large" />
      <Text>Please wait, securely updating records...</Text>
    </Stack>
  );

  const openCsvModal = (dataList) => {
    const headers = ["Team", "Repository", "File", "Line", "Type", "Reason", "Redacted Secret", "Source Link"];
    const rows = dataList.map(s => {
      const escapeCSV = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
      return [
        escapeCSV(s.team),
        escapeCSV(s.repo),
        escapeCSV(s.file),
        s.line,
        escapeCSV(s.rule),
        escapeCSV(s.ignoreReason || ''),
        escapeCSV(s.redacted_secret),
        escapeCSV(s.link)
      ].join(',');
    });
    setCsvContent([headers.join(','), ...rows].join('\n'));
    setIsCsvModalOpen(true);
  };

  const latestScanDateObj = scans.length > 0 
    ? new Date(Math.max(...scans.filter(s => s?.value?.timestamp).map(s => new Date(s.value.timestamp))))
    : null;

  const latestScanTimeParts = latestScanDateObj ? (() => {
    const pad = (n) => n.toString().padStart(2, '0');
    let hours = latestScanDateObj.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return {
      date: `${pad(latestScanDateObj.getDate())}-${pad(latestScanDateObj.getMonth()+1)}-${latestScanDateObj.getFullYear()}`,
      time: `${pad(hours)}:${pad(latestScanDateObj.getMinutes())}:${pad(latestScanDateObj.getSeconds())} ${ampm}`
    };
  })() : null;

  const renderMetricCards = () => {
    const orgHealthPercent = scans.length > 0 ? Math.round((cleanRepos.length / scans.length) * 100) : 0;
    const healthBars = '█'.repeat(Math.round(orgHealthPercent / 5)) + '░'.repeat(20 - Math.round(orgHealthPercent / 5));

    return (
      <Inline space="space.400" alignBlock="center">
        <Stack alignInline="center">
          <Heading as="h2">{scans.length}</Heading>
          <Text>Total Repos</Text>
        </Stack>
        <PulseCard count={activeSecrets.length} />
        <Stack alignInline="center">
          <Heading as="h2">{cleanRepos.length}</Heading>
          <Lozenge appearance="success">Clean Repos</Lozenge>
        </Stack>
        <Stack alignInline="center">
          <Heading as="h2">{ignoredSecrets.length}</Heading>
          <Lozenge appearance="default">Ignored Secrets</Lozenge>
        </Stack>
        <Stack alignInline="center">
          <Heading as="h4">{latestScanTimeParts ? `[Date - ${latestScanTimeParts.date}]   [Time - ${latestScanTimeParts.time}]` : 'Never'}</Heading>
          <Lozenge appearance="inprogress">Last Scanned</Lozenge>
        </Stack>
        <Stack alignInline="center" space="space.050">
          <Heading as="h4">Health: {orgHealthPercent}%</Heading>
          <Text color={orgHealthPercent === 100 ? "color.text.success" : "color.text.danger"}>
            [{healthBars}]
          </Text>
        </Stack>
      </Inline>
    );
  };

  const ignoredMap = {};
  ignoredList.forEach(item => {
    const fingerprint = item.key.replace('ignore_', '');
    ignoredMap[fingerprint] = item.value;
  });

  const activeSecrets = [];
  const ignoredSecrets = [];
  const cleanRepos = [];
  const excludedRepos = [];

  scans.forEach(scan => {
    const repoName = scan && scan.key ? scan.key.replace('scan_', '') : 'Unknown';
    const repoSecrets = scan && scan.value && Array.isArray(scan.value.secrets) ? scan.value.secrets : [];
    const teamName = scan && scan.value && scan.value.team ? scan.value.team : 'Unassigned';
    
    if (scan && scan.value && scan.value.excluded) {
      excludedRepos.push({ repo: repoName, team: teamName, timestamp: scan.value.timestamp });
    } else if (repoSecrets.length === 0) {
      cleanRepos.push({ repo: repoName, team: teamName, timestamp: scan.value.timestamp });
    } else {
      repoSecrets.forEach((secret, index) => {
        const item = {
          repo: repoName,
          team: teamName,
          fingerprint: secret.fingerprint,
          file: secret.file || '',
          line: secret.line || 0,
          rule: secret.rule || '',
          redacted_secret: secret.redacted_secret || '',
          link: secret.link || '',
          uid: `${secret.fingerprint}_${repoName}_${index}`
        };
        
        if (ignoredMap[secret.fingerprint]) {
          item.ignoreReason = ignoredMap[secret.fingerprint].reason;
          ignoredSecrets.push(item);
        } else {
          activeSecrets.push(item);
        }
      });
    }
  });

  const filterList = (list) => {
    return list.filter(s => {
      if (filterTeam && (!s.team || !s.team.toLowerCase().includes(filterTeam.toLowerCase()))) return false;
      if (filterRepo && (!s.repo || !s.repo.toLowerCase().includes(filterRepo.toLowerCase()))) return false;
      if (filterFile && (!s.file || !s.file.toLowerCase().includes(filterFile.toLowerCase()))) return false;
      if (filterLine && (!s.line || !s.line.toString().includes(filterLine))) return false;
      if (filterType && (!s.rule || !s.rule.toLowerCase().includes(filterType.toLowerCase()))) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!(
          (s.repo && s.repo.toLowerCase().includes(q)) ||
          (s.team && s.team.toLowerCase().includes(q)) ||
          (s.file && s.file.toLowerCase().includes(q)) ||
          (s.rule && s.rule.toLowerCase().includes(q)) ||
          (s.redacted_secret && s.redacted_secret.toLowerCase().includes(q))
        )) return false;
      }
      return true;
    });
  };

  const filterRepos = (list) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(r => 
      (r.repo && r.repo.toLowerCase().includes(q)) ||
      (r.team && r.team.toLowerCase().includes(q))
    );
  };

  const filteredActive = filterList(activeSecrets);
  const filteredIgnored = filterList(ignoredSecrets).filter(s => {
    if (filterReason && (!s.ignoreReason || !s.ignoreReason.toLowerCase().includes(filterReason.toLowerCase()))) return false;
    return true;
  });
  const filteredClean = filterRepos(cleanRepos);
  const filteredExcluded = filterRepos(excludedRepos);

  const repoCounts = {};
  const teamCounts = {};
  const ruleCounts = {};
  const ignoreReasonCounts = {};

  filteredActive.forEach(s => {
    repoCounts[s.repo] = (repoCounts[s.repo] || 0) + 1;
    teamCounts[s.team] = (teamCounts[s.team] || 0) + 1;
    ruleCounts[s.rule] = (ruleCounts[s.rule] || 0) + 1;
  });

  filteredIgnored.forEach(s => {
    ignoreReasonCounts[s.ignoreReason || 'Unknown'] = (ignoreReasonCounts[s.ignoreReason || 'Unknown'] || 0) + 1;
  });

  const repoChartData = Object.entries(repoCounts).map(([repo, count]) => ({ repo, count }));
  const teamChartData = Object.entries(teamCounts).map(([team, count]) => ({ team, count }));
  const ruleChartData = Object.entries(ruleCounts).map(([rule, count]) => ({ rule, count }));
  const ignoreChartData = Object.entries(ignoreReasonCounts).map(([reason, count]) => ({ reason, count }));

  const secretHead = {
    cells: [
      { key: 'select', content: 'Select', isSortable: false },
      { key: 'team', content: 'Team', isSortable: true },
      { key: 'repo', content: 'Repository', isSortable: true },
      { key: 'file', content: 'File', isSortable: true },
      { key: 'line', content: 'Line', isSortable: true },
      { key: 'rule', content: 'Type', isSortable: true },
      { key: 'secret', content: 'Redacted Secret', isSortable: false },
      { key: 'link', content: 'Source', isSortable: false },
      { key: 'action', content: 'Action', isSortable: false }
    ]
  };

  const ignoredHead = {
    cells: [
      { key: 'team', content: 'Team', isSortable: true },
      { key: 'repo', content: 'Repository', isSortable: true },
      { key: 'file', content: 'File', isSortable: true },
      { key: 'line', content: 'Line', isSortable: true },
      { key: 'rule', content: 'Type', isSortable: true },
      { key: 'reason', content: 'Reason', isSortable: true },
      { key: 'secret', content: 'Redacted Secret', isSortable: false },
      { key: 'link', content: 'Source', isSortable: false },
      { key: 'action', content: 'Action', isSortable: false }
    ]
  };

  const activeRows = filteredActive.length === 0 ? [] : filteredActive.map((s, index) => ({
    key: `active-${index}`,
    cells: [
      { key: `chk-${index}`, content: (
        <Checkbox 
          isChecked={selectedFingerprints.includes(s.uid)} 
          onChange={() => toggleSelection(s.uid)} 
        />
      )},
      { key: `t-${index}`, content: s.team },
      { key: `r-${index}`, content: s.repo },
      { key: `f-${index}`, content: s.file },
      { key: `l-${index}`, content: s.line.toString() },
      { key: `rl-${index}`, content: s.rule },
      { key: `s-${index}`, content: s.redacted_secret },
      { key: `lk-${index}`, content: <Link href={s.link} openNewTab={true}>View</Link> },
      { key: `a-${index}`, content: <Button onClick={() => openIgnoreModal([s.uid])}>Ignore</Button> }
    ]
  }));

  const ignoredRows = filteredIgnored.length === 0 ? [] : filteredIgnored.map((s, index) => ({
    key: `ignored-${index}`,
    cells: [
      { key: `t-${index}`, content: s.team },
      { key: `r-${index}`, content: s.repo },
      { key: `f-${index}`, content: s.file },
      { key: `l-${index}`, content: s.line.toString() },
      { key: `rl-${index}`, content: s.rule },
      { key: `rsn-${index}`, content: s.ignoreReason },
      { key: `s-${index}`, content: s.redacted_secret },
      { key: `lk-${index}`, content: <Link href={s.link} openNewTab={true}>View</Link> },
      { key: `a-${index}`, content: <Button onClick={() => handleRestore(s.fingerprint, s.repo, s.file)}>Restore</Button> }
    ]
  }));

  const cleanHead = {
    cells: [
      { key: 'team', content: 'Team', isSortable: true },
      { key: 'repo', content: 'Repository', isSortable: true },
      { key: 'time', content: 'Last Scanned', isSortable: true }
    ]
  };

  const cleanRows = filteredClean.length === 0 ? [] : filteredClean.map((r, index) => ({
    key: `clean-${index}`,
    cells: [
      { key: `t-${index}`, content: r.team },
      { key: `r-${index}`, content: r.repo },
      { key: `tms-${index}`, content: r.timestamp ? formatDate(new Date(r.timestamp)) : '' }
    ]
  }));

  const excludedRows = filteredExcluded.length === 0 ? [] : filteredExcluded.map((r, index) => ({
    key: `excl-${index}`,
    cells: [
      { key: `t-${index}`, content: r.team },
      { key: `r-${index}`, content: r.repo },
      { key: `tms-${index}`, content: r.timestamp ? formatDate(new Date(r.timestamp)) : '' }
    ]
  }));

  return (
    <Stack space="space.400">
      <Inline space="space.100" alignBlock="center">
        <Heading size="small">Welcome to the Gitleaks Security Dashboard. Review your repository security posture below.</Heading>
        <Button appearance="subtle" onClick={() => setIsAuditOpen(true)}>📜 Activity Log</Button>
        <Button appearance="subtle" onClick={() => setShowWebhookInfo(!showWebhookInfo)}>App Webtrigger Link</Button>
      </Inline>
      
      <AuditLogModal isOpen={isAuditOpen} onClose={() => setIsAuditOpen(false)} />
      
      {renderMetricCards()}
      
      {showWebhookInfo && webhookUrl && (
        <Text>Web Trigger/ Web Hook URL (Added to the Pipeline variables): {webhookUrl}</Text>
      )}
      
      <FilterField 
        name="search" 
        placeholder="Filter by repo, file, or secret type..." 
        value={searchQuery}
        onChange={(val) => setSearchQuery(val)} 
      />
      
      <Tabs id="dashboard-tabs">
        <TabList>
          <Tab>Active Threats ({filteredActive.length})</Tab>
          <Tab>Ignored Secrets ({filteredIgnored.length})</Tab>
          <Tab>Clean Repos ({filteredClean.length})</Tab>
          <Tab>Excluded Repos ({filteredExcluded.length})</Tab>
        </TabList>
        <TabPanel>
          <Stack space="space.200">
            {filteredActive.length > 0 && (
              <Stack space="space.200">
                <Inline space="space.200" alignBlock="stretch">
                  <PieChart data={repoChartData} valueAccessor="count" labelAccessor="repo" colorAccessor="repo" title="Secrets by Repository" />
                  <PieChart data={ruleChartData} valueAccessor="count" labelAccessor="rule" colorAccessor="rule" title="Secrets by Type" />
                </Inline>
                <BarChart data={teamChartData} xAccessor="team" yAccessor="count" title="Secrets by Team" />
              </Stack>
            )}
            
            <Stack space="space.100">
              <Stack space="space.100">
                  <Inline space="space.100">
                    <FilterField name="ft" value={filterTeam} placeholder="🔍 Filter Team" onChange={val => setFilterTeam(val)} />
                    <FilterField name="fr" value={filterRepo} placeholder="🔍 Filter Repo" onChange={val => setFilterRepo(val)} />
                    <FilterField name="ff" value={filterFile} placeholder="🔍 Filter File" onChange={val => setFilterFile(val)} />
                    <FilterField name="fl" value={filterLine} placeholder="🔍 Filter Line" onChange={val => setFilterLine(val)} />
                    <FilterField name="fty" value={filterType} placeholder="🔍 Filter Type" onChange={val => setFilterType(val)} />
                  </Inline>
                  <Inline space="space.100">
                    {filteredActive.length > 0 && (
                      <Button 
                        appearance="default" 
                        onClick={() => {
                          const allUids = filteredActive.map(s => s.uid);
                          const allSelected = allUids.every(uid => selectedFingerprints.includes(uid));
                          if (allSelected) {
                            setSelectedFingerprints([]);
                          } else {
                            setSelectedFingerprints(allUids);
                          }
                        }}
                      >
                        {filteredActive.every(s => selectedFingerprints.includes(s.uid)) ? 'Deselect All' : `Select All (${filteredActive.length})`}
                      </Button>
                    )}
                    {selectedFingerprints.length > 0 && (
                      <Button appearance="warning" onClick={() => {
                        openIgnoreModal(selectedFingerprints);
                      }}>
                        Bulk Ignore ({selectedFingerprints.length}) Selected
                      </Button>
                    )}
                    {selectedFingerprints.length > 0 && (
                      <Button appearance="subtle" onClick={() => setSelectedFingerprints([])}>
                        Clear Selection
                      </Button>
                    )}
                    <Button appearance="subtle" onClick={() => openCsvModal(filteredActive)}>📄 Copy CSV Data</Button>
                  </Inline>
                </Stack>
              <DynamicTable head={secretHead} rows={activeRows} emptyView="No active threats found!" />
            </Stack>
          </Stack>
        </TabPanel>
        <TabPanel>
          <Stack space="space.200">
            {filteredIgnored.length > 0 && (
              <PieChart data={ignoreChartData} valueAccessor="count" labelAccessor="reason" colorAccessor="reason" title="Ignore Reasons Breakdown" />
            )}
            <Stack space="space.100">
              <Inline space="space.100">
                  <FilterField name="ftIg" value={filterTeam} placeholder="🔍 Filter Team" onChange={val => setFilterTeam(val)} />
                  <FilterField name="frIg" value={filterRepo} placeholder="🔍 Filter Repo" onChange={val => setFilterRepo(val)} />
                  <FilterField name="ffIg" value={filterFile} placeholder="🔍 Filter File" onChange={val => setFilterFile(val)} />
                  <FilterField name="flIg" value={filterLine} placeholder="🔍 Filter Line" onChange={val => setFilterLine(val)} />
                  <FilterField name="ftyIg" value={filterType} placeholder="🔍 Filter Type" onChange={val => setFilterType(val)} />
                  <FilterField name="frsnIg" value={filterReason} placeholder="🔍 Filter Reason" onChange={val => setFilterReason(val)} />
                  <Button appearance="subtle" onClick={() => openCsvModal(filteredIgnored)}>📄 Copy CSV Data</Button>
                </Inline>
              <DynamicTable head={ignoredHead} rows={ignoredRows} emptyView="No ignored secrets." />
            </Stack>
          </Stack>
        </TabPanel>
        <TabPanel>
          <DynamicTable head={cleanHead} rows={cleanRows} emptyView="No clean repositories." />
        </TabPanel>
        <TabPanel>
          <DynamicTable head={cleanHead} rows={excludedRows} emptyView="No excluded repositories." />
        </TabPanel>
      </Tabs>
      
      <ModalTransition>
        {isModalOpen && (
          <Modal onClose={() => setIsModalOpen(false)}>
            <ModalHeader>
              <ModalTitle>Dismiss Secret</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Text>Please select a reason for ignoring this secret.</Text>
              <Select
                options={[
                  { label: 'False Positive', value: 'False Positive' },
                  { label: 'Coming from upstream, can be dismissed', value: 'Coming from upstream, can be dismissed' },
                  { label: 'Sandbox / Localhost config only', value: 'Sandbox / Localhost config only' },
                  { label: 'Test files only - not used in production', value: 'Test files only - not used in production' },
                  { label: 'Default environment config', value: 'Default environment config' },
                  { label: 'Others', value: 'Others' }
                ]}
                onChange={(option) => setCustomReason(option?.value || option)}
              />
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={submitIgnore}>Confirm Ignore</Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
      
      <ModalTransition>
        {isCsvModalOpen && (
          <Modal onClose={() => setIsCsvModalOpen(false)} width="x-large">
            <ModalHeader>
              <ModalTitle>Export CSV</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Text>Atlassian Forge currently restricts direct file downloads. To save your data:</Text>
              <Text>1. Click inside the text box below.</Text>
              <Text>2. Press Ctrl+A (or Cmd+A) to select everything, and copy it.</Text>
              <Text>3. Paste it into a blank file and save it as export.csv.</Text>
              <TextArea 
                isReadOnly={true}
                value={csvContent}
                minimumRows={15}
              />
            </ModalBody>
            <ModalFooter>
              <Button appearance="primary" onClick={() => setIsCsvModalOpen(false)}>Done</Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
