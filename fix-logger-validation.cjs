const fs = require('fs');
let content = fs.readFileSync('src/components/QuickActivityDrawer.tsx', 'utf8');

// 1. Update handleChannelSelect
content = content.replace(
  `  const handleChannelSelect = (newChannel: ActivityChannel) => {
    setChannel(newChannel);
    const available = callStatuses?.length ? callStatuses.map(s => s.name) : getStatusesForChannel(newChannel);
    let activeStatus = status;
    if (available.length > 0 && !available.includes(status)) {
      activeStatus = available[0] as CallStatus;
      setStatus(activeStatus);
    }

    const validPurposes = getPurposesForChannel(newChannel);
    if (!validPurposes.includes(purpose)) {
      setPurpose(validPurposes[0]);
    }

    if (outcome && (!isSuccessStatus(activeStatus) || !OUTCOMES.includes(outcome as any))) {
      setOutcome('');
    }
  };`,
  `  const handleChannelSelect = (newChannel: ActivityChannel) => {
    setChannel(newChannel);
    const available = callStatuses?.length ? callStatuses.map(s => s.name) : getStatusesForChannel(newChannel);
    let activeStatus = status;
    if (available.length > 0 && !available.includes(status)) {
      activeStatus = available[0] as CallStatus;
      setStatus(activeStatus);
    }

    const validPurposes = getPurposesForChannel(newChannel);
    if (!validPurposes.includes(purpose)) {
      setPurpose(validPurposes[0]);
    }

    const normChan = newChannel.toLowerCase();
    const isAsync = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
    
    if (isAsync || (outcome && (!isSuccessStatus(activeStatus) || !OUTCOMES.includes(outcome as any)))) {
      setOutcome('');
    }
    
    if (newChannel !== 'Email') setEmailSubject('');
    if (newChannel !== 'WhatsApp' && newChannel !== 'Message (WhatsApp/SMS)') setWhatsappDraft('');
    if (newChannel !== 'Meeting' && newChannel !== 'Site Visit') setLocationOrLink('');
    
    setValidationError(null);
  };`
);

// 2. Update the useEffect logic
content = content.replace(
  `    const isAsyncChannel = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
    const isSentStatus = activeStatus.toLowerCase().includes('sent') || activeStatus.toLowerCase().includes('delivered');

    if (isAsyncChannel && isSentStatus && outcome !== 'Message Sent / Awaiting Reply') {
      setOutcome('Message Sent / Awaiting Reply');
    } else if (outcome && !isSuccessStatus(activeStatus)) {
      setOutcome('');
    }`,
  `    const isAsyncChannel = !!normChan.match(/email|message|whatsapp|sms/);

    if (isAsyncChannel) {
      if (outcome) setOutcome('');
    } else if (outcome && !isSuccessStatus(activeStatus)) {
      setOutcome('');
    }`
);

// 3. Update the handleSave validation
content = content.replace(
  `    const normChan = channel.toLowerCase();
    const isAsyncChannel = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
    const isSentStatus = status.toLowerCase().includes('sent') || status.toLowerCase().includes('delivered');
    const isOutcomeRequired = !(isAsyncChannel && isSentStatus);

    if (isCompletedState && isOutcomeRequired && (!outcome || !outcome.trim())) {`,
  `    const normChan = channel.toLowerCase();
    const isAsyncChannel = !!normChan.match(/email|message|whatsapp|sms/);
    const isOutcomeRequired = !isAsyncChannel;

    if (isCompletedState && isOutcomeRequired && (!outcome || !outcome.trim())) {`
);

fs.writeFileSync('src/components/QuickActivityDrawer.tsx', content);
