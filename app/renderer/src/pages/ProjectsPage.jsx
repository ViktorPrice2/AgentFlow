import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

function normalizeChannelList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }

        if (item && typeof item === 'object' && typeof item.id === 'string') {
          return item.id.trim();
        }

        return null;
      })
      .filter((item) => item && item.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeChannelList(parsed);
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  return [];
}

function createProjectPayload(formState) {
  const payload = {
    name: formState.name.trim(),
    industry: formState.industry.trim(),
    description: formState.description.trim(),
    deeplink: formState.deeplink.trim(),
    channels: normalizeChannelList(formState.channels)
  };

  if (formState.presetId && formState.presetId !== 'generic') {
    payload.presetId = formState.presetId;
  } else {
    payload.presetId = formState.presetId || 'generic';
  }

  if (formState.id) {
    payload.id = formState.id;
  }

  return payload;
}

const INITIAL_FORM_STATE = {
  id: null,
  name: '',
  industry: '',
  description: '',
  deeplink: '',
  channels: '',
  presetId: 'generic'
};

export function ProjectsPage({
  projects,
  selectedProjectId = null,
  selectedProject: selectedProjectProp = null,
  onCreateProject,
  onSelectProject,
  onNotify,
  botStatus = null,
  botBusy = false,
  onStartBot = () => {},
  onStopBot = () => {},
  onRefreshBot = () => {},
  contacts = [],
  contactsLoading = false,
  onRefreshContacts = () => {},
  onSaveContact = async () => null,
  onSendInvite = async () => false,
  onApproveBrief = async () => false,
  inviteHistory = [],
  onRefreshInviteHistory = async () => [],
  presetOptions = [],
  presetsLoading = false,
  presetDiff = null,
  presetBusy = false,
  presetDiffLoading = false,
  onApplyPreset = async () => false,
  onClearPresetDraft = async () => false,
  onRefreshPresetDiff = async () => {},
  onOpenBrief = () => {}
}) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactForm, setContactForm] = useState({ chatId: '', label: '' });
  const [inviteFeedback, setInviteFeedback] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetReviewLoading, setPresetReviewLoading] = useState(false);
  const selectedProject = useMemo(
    () => selectedProjectProp || projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId, selectedProjectProp]
  );
  const selectedProjectChannels = normalizeChannelList(selectedProject?.channels);
  const selectedProjectChannelsLabel =
    selectedProjectChannels.length > 0 ? selectedProjectChannels.join(', ') : t('common.notAvailable');
  const briefStatusKey = (selectedProject?.briefStatus || 'pending').toLowerCase();
  const briefStatusLabel = t(`projects.status.${briefStatusKey}`, undefined, selectedProject?.briefStatus || 'pending');
  const briefProgressValue = Math.round(Math.min(Math.max((selectedProject?.briefProgress ?? 0) * 100, 0), 100));
  const needsAttentionFields = Array.isArray(selectedProject?.needsAttention?.missingFields)
    ? selectedProject.needsAttention.missingFields
    : [];
  const needsAttentionLabels = needsAttentionFields.map((field) =>
    t(`brief.labels.${field}`, undefined, field)
  );
  const canApproveBrief = selectedProject?.briefStatus === 'review';
  const briefApproved = selectedProject?.briefStatus === 'approved';
  const projectLastInvite = selectedProject?.tgLastInvitation
    ? new Date(selectedProject.tgLastInvitation).toLocaleString(locale)
    : null;
  const projectContactStatus = (selectedProject?.tgContactStatus || 'unknown').toLowerCase();
  const projectContactStatusLabel = t(
    `projects.telegram.status.${projectContactStatus}`,
    undefined,
    selectedProject?.tgContactStatus || 'unknown'
  );
  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );
  const selectedContactStatus = (selectedContact?.status || 'unknown').toLowerCase();
  const selectedContactStatusLabel = t(
    `projects.telegram.status.${selectedContactStatus}`,
    undefined,
    selectedContact?.status || 'unknown'
  );
  const selectedContactLastSeen = selectedContact?.lastContactAt
    ? new Date(selectedContact.lastContactAt).toLocaleString(locale)
    : null;
  const inviteDisabled = contactsLoading || botBusy;
  const inviteHistoryItems = useMemo(
    () => (Array.isArray(inviteHistory) ? inviteHistory.slice(0, 5) : []),
    [inviteHistory]
  );
  const hasInviteHistory = inviteHistoryItems.length > 0;
  const presetOptionMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(presetOptions) ? presetOptions : []).forEach((option) => {
      if (option && option.id) {
        map.set(option.id, option);
      }
    });
    return map;
  }, [presetOptions]);
  const selectedProjectPresetId = selectedProject?.presetId || 'generic';
  const selectedProjectPreset =
    presetOptionMap.get(selectedProjectPresetId) || presetOptionMap.get('generic') || null;
  const presetName = selectedProjectPreset?.name || t('projects.presets.genericName');
  const presetVersionValue =
    selectedProject?.presetVersion && String(selectedProject.presetVersion).trim().length > 0
      ? selectedProject.presetVersion
      : null;
  const presetUpdatedAt = selectedProjectPreset?.updatedAt || presetDiff?.meta?.updatedAt || null;
  const hasPresetUpdate = Boolean(presetDiff?.hasUpdate);
  const presetNotes = Array.isArray(presetDiff?.notes) ? presetDiff.notes : [];
  const isPresetLoading = presetsLoading || presetDiffLoading || presetBusy;
  const presetDraft =
    selectedProject?.presetDraft && typeof selectedProject.presetDraft === 'object'
      ? selectedProject.presetDraft
      : null;
  const presetDraftSummary = typeof presetDraft?.summary === 'string' ? presetDraft.summary : null;
  const presetDraftSuggestions = Array.isArray(presetDraft?.suggestions) ? presetDraft.suggestions : [];
  const presetDraftQuestions = Array.isArray(presetDraft?.additionalQuestions)
    ? presetDraft.additionalQuestions
    : [];
  const hasPresetDraft = Boolean(
    presetDraftSummary || presetDraftSuggestions.length > 0 || presetDraftQuestions.length > 0
  );
  const presetDraftMeta = presetDraft?.presetMeta || null;
  const presetDraftGeneratedAt = presetDraft?.generatedAt || null;
  const canOpenBriefSection = ['review', 'approved'].includes(briefStatusKey);

  useEffect(() => {
    setSelectedContactId('');
    setContactForm({ chatId: '', label: '' });
    setInviteFeedback(null);
    setHistoryLoading(false);
    setApproveModalOpen(false);
    setApproveLoading(false);
    setPresetModalOpen(false);
    setPresetReviewLoading(false);
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedContactId && !contacts.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId('');
      setInviteFeedback(null);
    }
  }, [contacts, selectedContactId]);

  useEffect(() => {
    if (!Array.isArray(presetOptions) || presetOptions.length === 0) {
      return;
    }

    setFormState((previous) => {
      const currentPresetId = previous.presetId || 'generic';
      if (presetOptions.some((option) => option.id === currentPresetId)) {
        return previous;
      }

      const fallbackPreset =
        presetOptions.find((option) => option.id === 'generic') || presetOptions[0] || null;

      if (!fallbackPreset || fallbackPreset.id === previous.presetId) {
        return previous;
      }

      return { ...previous, presetId: fallbackPreset.id };
    });
  }, [presetOptions]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleContactSelect = (event) => {
    setSelectedContactId(event.target.value);
    setInviteFeedback(null);
  };

  const handleContactFormChange = (event) => {
    const { name, value } = event.target;
    setContactForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveContactClick = async () => {
    if (!contactForm.chatId.trim()) {
      onNotify(t('projects.telegram.chatIdRequired'), 'error');
      return;
    }

    const saved = await onSaveContact({
      chatId: contactForm.chatId.trim(),
      label: contactForm.label.trim()
    });

    if (saved?.id) {
      setSelectedContactId(saved.id);
      setContactForm({ chatId: '', label: '' });
      setInviteFeedback(null);
    }
  };

  const handleSendInviteClick = async () => {
    const chatId = selectedContact?.chatId || contactForm.chatId.trim();

    if (!chatId) {
      onNotify(t('projects.telegram.chatIdRequired'), 'error');
      return;
    }

    setInviteFeedback(null);

    try {
      const result = await onSendInvite(chatId);
      const manualChatId = contactForm.chatId.trim();
      const targetLabel =
        selectedContact?.label ||
        (selectedContact?.chatId !== undefined ? String(selectedContact.chatId) : '') ||
        (manualChatId ? manualChatId : '') ||
        String(chatId);

      if (result && typeof result === 'object') {
        if (result.ok) {
          const sentAt = result.response?.sentAt;
          const formattedDate = sentAt ? new Date(sentAt).toLocaleString(locale) : null;
          const successMessage = formattedDate
            ? t('projects.telegram.inviteInlineSuccessWithDate', {
                chatId: targetLabel,
                date: formattedDate
              })
            : t('projects.telegram.inviteInlineSuccess', { chatId: targetLabel });

          setInviteFeedback({ type: 'success', message: successMessage });
        } else {
          const inlineMessage =
            typeof result.message === 'string' && result.message
              ? result.message
              : result.error
                ? t('projects.telegram.inviteInlineErrorWithReason', { reason: result.error })
                : t('projects.telegram.inviteInlineError');

          setInviteFeedback({ type: 'error', message: inlineMessage });
        }
      } else if (result === true) {
        setInviteFeedback({
          type: 'success',
          message: t('projects.telegram.inviteInlineSuccess', { chatId: targetLabel })
        });
      } else if (result === false) {
        setInviteFeedback({ type: 'error', message: t('projects.telegram.inviteInlineError') });
      }
    } catch (error) {
      console.error('Failed to send invite (UI)', error);
      const inlineMessage = error?.message
        ? t('projects.telegram.inviteInlineErrorWithReason', { reason: error.message })
        : t('projects.telegram.inviteInlineError');
      setInviteFeedback({ type: 'error', message: inlineMessage });
    }
  };

  const handleRefreshContacts = () => {
    if (selectedProjectId) {
      onRefreshContacts(selectedProjectId);
    }
  };

  const handleRefreshHistory = async () => {
    if (!selectedProjectId || typeof onRefreshInviteHistory !== 'function') {
      return;
    }

    setHistoryLoading(true);

    try {
      await onRefreshInviteHistory(selectedProjectId);
    } catch (error) {
      console.error('Failed to refresh invite history', error);
      onNotify(t('projects.toast.inviteError'), 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleApproveBriefClick = () => {
    if (!selectedProject) {
      onNotify(t('projects.toast.projectRequired'), 'error');
      return;
    }

    if (!canApproveBrief) {
      if (briefApproved) {
        onNotify(t('projects.details.alreadyApproved'), 'info');
      } else {
        onNotify(t('projects.details.approveUnavailable'), 'info');
      }
      return;
    }

    setApproveModalOpen(true);
  };

  const handleApproveModalConfirm = async () => {
    if (!selectedProject || !canApproveBrief) {
      return;
    }

    setApproveLoading(true);

    try {
      const result = await onApproveBrief(selectedProject);

      if (result !== false) {
        setApproveModalOpen(false);
      }
    } finally {
      setApproveLoading(false);
    }
  };

  const handleApproveModalClose = () => {
    if (!approveLoading) {
      setApproveModalOpen(false);
    }
  };

  const handleOpenBriefClick = () => {
    if (!selectedProject) {
      onNotify(t('projects.toast.projectRequired'), 'error');
      return;
    }

    if (!canOpenBriefSection) {
      onNotify(t('projects.details.openBriefDisabled'), 'info');
      return;
    }

    onOpenBrief(selectedProject);
  };

  const handleRefreshPresetClick = () => {
    if (!selectedProject) {
      onNotify(t('projects.toast.projectRequired'), 'error');
      return;
    }

    const maybePromise = onRefreshPresetDiff(selectedProject);

    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.catch(() => {});
    }
  };

  const handleApplyPresetClick = async () => {
    if (!selectedProject) {
      onNotify(t('projects.toast.projectRequired'), 'error');
      return;
    }

    await onApplyPreset(selectedProject.id, selectedProject.presetId || 'generic');
  };

  const handleReviewPresetDraft = () => {
    if (!hasPresetDraft) {
      onNotify(t('projects.details.presetDraftMissing'), 'info');
      return;
    }

    setPresetModalOpen(true);
  };

  const handleApplyPresetDraft = async () => {
    if (!selectedProject || !hasPresetDraft) {
      return;
    }

    setPresetReviewLoading(true);

    try {
      const presetIdToApply = presetDraft?.presetId || selectedProject.presetId || 'generic';
      const result = await onApplyPreset(selectedProject.id, presetIdToApply, { clearDraft: true });

      if (result) {
        setPresetModalOpen(false);
      }
    } finally {
      setPresetReviewLoading(false);
    }
  };

  const handleDismissPresetDraft = async () => {
    if (!selectedProject || !hasPresetDraft) {
      return;
    }

    setPresetReviewLoading(true);

    try {
      const result = await onClearPresetDraft(selectedProject.id);

      if (result) {
        setPresetModalOpen(false);
      }
    } finally {
      setPresetReviewLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      onNotify(t('projects.toast.nameRequired'), 'error');
      return;
    }

    const payload = createProjectPayload(formState);
    try {
      const savedProject = await onCreateProject(payload);
      onNotify(t('projects.toast.saved'), 'success');
      setFormState(() => ({ ...INITIAL_FORM_STATE }));

      if (savedProject?.id) {
        onSelectProject(savedProject.id);
      }
    } catch (error) {
      console.error('Failed to create project', error);
      onNotify(error?.message || t('app.toasts.genericError'), 'error');
    }
  };

  const statusKey = (botStatus?.status || (botStatus?.running ? 'running' : 'stopped') || '').toLowerCase();
  const botStatusLabels = {
    running: t('settings.telegram.statusRunning'),
    starting: t('settings.telegram.statusStarting'),
    stopped: t('settings.telegram.statusStopped'),
    error: t('settings.telegram.statusErrorShort'),
    unknown: t('settings.telegram.statusUnknown')
  };
  const normalizedStatus = botStatusLabels[statusKey] || botStatusLabels.unknown;
  const tokenStored = Boolean(botStatus?.tokenStored);
  const canStart = !botBusy && tokenStored && statusKey !== 'running' && statusKey !== 'starting';
  const canStop = !botBusy && statusKey === 'running';
  const statusClass =
    statusKey === 'running'
      ? 'success'
      : statusKey === 'starting'
        ? 'info'
        : statusKey === 'error'
          ? 'warn'
          : 'info';

  return (
    <>
      <div className="page-grid">
      <InfoCard
        title={t('projects.list.title')}
        subtitle={t('projects.list.subtitle')}
      >
        {projects.length === 0 ? (
          <EmptyState
            title={t('projects.list.emptyTitle')}
            description={t('projects.list.emptyDescription')}
          />
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={`project-list__item ${project.id === selectedProjectId ? 'active' : ''}`}
                  onClick={() => onSelectProject(project.id)}
                >
                  <div>
                    <h4>{project.name}</h4>
                    <p>{project.industry || t('projects.list.industryMissing')}</p>
                  </div>
                  <span>{new Date(project.updatedAt).toLocaleString(locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>

      <InfoCard
        title={t('projects.form.title')}
        subtitle={t('projects.form.subtitle')}
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('projects.form.name')}
            <input
              name="name"
              value={formState.name}
              onChange={handleInputChange}
              placeholder={t('projects.form.namePlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.industry')}
            <input
              name="industry"
              value={formState.industry}
              onChange={handleInputChange}
              placeholder={t('projects.form.industryPlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.description')}
            <textarea
              name="description"
              value={formState.description}
              onChange={handleInputChange}
              rows={4}
              placeholder={t('projects.form.descriptionPlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.preset')}
            <select
              name="presetId"
              value={formState.presetId}
              onChange={handleInputChange}
              disabled={presetsLoading}
            >
              {(Array.isArray(presetOptions) ? presetOptions : []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.version ? ` (${option.version})` : ''}
                </option>
              ))}
            </select>
            <span className="hint">{t('projects.form.presetHint')}</span>
          </label>
          <label>
            {t('projects.form.channels')}
            <input
              name="channels"
              value={formState.channels}
              onChange={handleInputChange}
              placeholder={t('projects.form.channelsPlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.deeplink')}
            <input
              name="deeplink"
              value={formState.deeplink}
              onChange={handleInputChange}
              placeholder={t('projects.form.deeplinkPlaceholder')}
            />
          </label>

          <button type="submit" className="primary-button">{t('common.saveProject')}</button>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={onStartBot}
              disabled={!canStart}
            >
              {botBusy && statusKey === 'starting'
                ? t('settings.telegram.statusStarting')
                : t('settings.telegram.start')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStopBot}
              disabled={!canStop}
            >
              {t('settings.telegram.stop')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onRefreshBot}
              disabled={botBusy}
            >
              {t('settings.telegram.refresh')}
            </button>
          </div>
          <p className="hint">
            <span className={`status-label ${tokenStored ? 'success' : 'warn'}`}>
              {tokenStored ? t('projects.form.botTokenStored') : t('projects.form.botTokenMissing')}
            </span>
          </p>
          <p className="hint">
            <span className={`status-label ${statusClass}`}>
              {t('projects.form.botStatus', {
                status: normalizedStatus,
                username: botStatus?.username ? ` @${botStatus.username}` : ''
              })}
            </span>
          </p>
        </form>
      </InfoCard>

      {selectedProject ? (
        <InfoCard
          title={t('projects.details.title')}
          subtitle={t('projects.details.subtitle')}
        >
          <dl className="project-details">
            <div>
              <dt>{t('projects.details.name')}</dt>
              <dd>{selectedProject.name}</dd>
            </div>
            <div>
              <dt>{t('projects.details.industry')}</dt>
              <dd>{selectedProject.industry || t('common.notAvailable')}</dd>
            </div>
            <div>
              <dt>{t('projects.details.description')}</dt>
              <dd>{selectedProject.description || t('common.notAvailable')}</dd>
            </div>
            <div>
              <dt>{t('projects.details.channels')}</dt>
              <dd>{selectedProjectChannelsLabel}</dd>
            </div>
            <div>
              <dt>{t('projects.details.deeplink')}</dt>
              <dd>
                {selectedProject.deeplink ? (
                  <a href={selectedProject.deeplink} target="_blank" rel="noreferrer">
                    {selectedProject.deeplink}
                  </a>
                ) : (
                  t('common.notAvailable')
                )}
              </dd>
            </div>
            <div>
              <dt>{t('projects.details.briefStatus')}</dt>
              <dd>
                <span className={`status-badge status-${briefStatusKey}`}>{briefStatusLabel}</span>
              </dd>
            </div>
            <div>
              <dt>{t('projects.details.briefProgress')}</dt>
              <dd>
                <div className="brief-progress">
                  <div className="brief-progress__track">
                    <div className="brief-progress__bar" style={{ width: `${briefProgressValue}%` }} />
                  </div>
                  <span className="brief-progress__value">{briefProgressValue}%</span>
                </div>
              </dd>
            </div>
            <div>
              <dt>{t('projects.details.needsAttention')}</dt>
              <dd>
                {needsAttentionLabels.length === 0 ? (
                  <span>{t('projects.details.needsAttentionNone')}</span>
                ) : (
                  <ul className="needs-attention-list">
                    {needsAttentionLabels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('projects.telegram.statusLabel')}</dt>
              <dd>{projectContactStatusLabel}</dd>
            </div>
            <div>
              <dt>{t('projects.telegram.lastInvitation')}</dt>
              <dd>{projectLastInvite || t('common.notAvailable')}</dd>
            </div>
          </dl>
          <div className="project-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleOpenBriefClick}
              disabled={!canOpenBriefSection}
            >
              {t('projects.details.openBrief')}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleApproveBriefClick}
              disabled={!canApproveBrief || approveLoading}
            >
              {approveLoading
                ? t('common.loading')
                : briefApproved
                  ? t('projects.details.briefApprovedLabel')
                  : t('projects.details.approveBrief')}
            </button>
          </div>
          <section className="preset-section">
            <header className="preset-section__header">
              <div>
                <h4>{t('projects.details.presetHeading')}</h4>
                <p>{t('projects.details.presetSubtitle', { preset: presetName })}</p>
              </div>
              <span
                className={`preset-status ${hasPresetUpdate ? 'preset-status--update' : 'preset-status--ok'}`}
              >
                {hasPresetUpdate
                  ? t('projects.details.presetStatusUpdate', {
                      latest: presetDiff?.latestVersion || t('projects.presets.versionUnknown'),
                      current: presetVersionValue || t('projects.presets.versionUnknown')
                    })
                  : t('projects.details.presetStatusUpToDate', {
                      version: presetVersionValue || t('projects.presets.versionUnknown')
                    })}
              </span>
            </header>
            <dl className="preset-section__meta">
              <div>
                <dt>{t('projects.details.presetName')}</dt>
                <dd>{presetName}</dd>
              </div>
              <div>
                <dt>{t('projects.details.presetVersion')}</dt>
                <dd>{presetVersionValue || t('projects.presets.versionUnknown')}</dd>
              </div>
              <div>
                <dt>{t('projects.details.presetLatest')}</dt>
                <dd>{presetDiff?.latestVersion || t('projects.presets.versionUnknown')}</dd>
              </div>
              <div>
                <dt>{t('projects.details.presetUpdatedAt')}</dt>
                <dd>
                  {presetUpdatedAt
                    ? new Date(presetUpdatedAt).toLocaleString(locale)
                    : t('common.notAvailable')}
                </dd>
              </div>
            </dl>
            {presetNotes.length > 0 ? (
              <ul className="preset-section__notes">
                {presetNotes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            ) : null}
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={handleRefreshPresetClick}
                disabled={isPresetLoading}
              >
                {isPresetLoading ? t('common.loading') : t('projects.details.refreshPreset')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleApplyPresetClick}
                disabled={isPresetLoading}
              >
                {isPresetLoading ? t('projects.details.presetLoading') : t('projects.details.applyPreset')}
              </button>
            </div>
            {hasPresetDraft ? (
              <div className="preset-draft-notice">
                <p>{presetDraftSummary || t('projects.details.presetDraftSummary')}</p>
                <button type="button" className="link-button" onClick={handleReviewPresetDraft}>
                  {t('projects.details.reviewPresetDraft')}
                </button>
              </div>
            ) : null}
          </section>
        </InfoCard>
      ) : null}

      {selectedProject ? (
        <InfoCard title={t('projects.telegram.title')} subtitle={t('projects.telegram.subtitle')}>
          <div className="telegram-contact-controls">
            <label>
              {t('projects.telegram.contactSelect')}
              <select
                value={selectedContactId}
                onChange={handleContactSelect}
                disabled={contactsLoading}
              >
                <option value="">{t('projects.telegram.contactPlaceholder')}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.label || contact.chatId}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={handleRefreshContacts}
              disabled={contactsLoading}
            >
              {contactsLoading ? t('projects.telegram.refreshing') : t('projects.telegram.refresh')}
            </button>
          </div>

          {selectedContact ? (
            <div className="telegram-contact-meta">
              <p>
                <strong>{t('projects.telegram.chatIdLabel')}:</strong> {selectedContact.chatId}
              </p>
              <p>
                <strong>{t('projects.telegram.contactStatusLabel')}:</strong> {selectedContactStatusLabel}
              </p>
              <p>
                <strong>{t('projects.telegram.lastContactAt')}:</strong>{' '}
                {selectedContactLastSeen || t('common.notAvailable')}
              </p>
            </div>
          ) : null}

          <div className="telegram-contact-form">
            <label>
              {t('projects.telegram.newContactChatId')}
              <input
                name="chatId"
                value={contactForm.chatId}
                onChange={handleContactFormChange}
                placeholder={t('projects.telegram.chatIdPlaceholder')}
              />
            </label>
            <label>
              {t('projects.telegram.newContactLabel')}
              <input
                name="label"
                value={contactForm.label}
                onChange={handleContactFormChange}
                placeholder={t('projects.telegram.labelPlaceholder')}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={handleSaveContactClick}
                disabled={contactsLoading}
              >
                {t('projects.telegram.saveContact')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSendInviteClick}
                disabled={inviteDisabled}
              >
                {t('projects.telegram.sendInvite')}
              </button>
            </div>
            {inviteFeedback?.message ? (
              <p className={`form-feedback ${inviteFeedback.type === 'success' ? 'success' : 'error'}`}>
                {inviteFeedback.message}
              </p>
            ) : null}
          </div>

          <p className="hint">
            {projectLastInvite
              ? t('projects.telegram.lastInviteAt', { date: projectLastInvite })
              : t('projects.telegram.noInvites')}
          </p>

          <div className="telegram-invite-history">
            <div className="telegram-invite-history__header">
              <h4>{t('projects.telegram.inviteHistory.title')}</h4>
              <button
                type="button"
                className="link-button"
                onClick={handleRefreshHistory}
                disabled={historyLoading}
              >
                {historyLoading
                  ? t('common.loadingHistory')
                  : t('projects.telegram.inviteHistory.refresh')}
              </button>
            </div>

            {historyLoading ? (
              <p className="hint">{t('common.loadingHistory')}</p>
            ) : hasInviteHistory ? (
              <ul className="telegram-invite-history__list">
                {inviteHistoryItems.map((entry) => {
                  const statusKey = String(entry.status || 'sent').toLowerCase().replace(/[^a-z0-9]+/g, '-');
                  const statusLabel = t(
                    `projects.telegram.inviteHistory.status.${entry.status}`,
                    undefined,
                    entry.status
                  );
                  const timestampLabel = entry.timestamp
                    ? new Date(entry.timestamp).toLocaleString(locale)
                    : t('common.notAvailable');

                  return (
                    <li key={entry.id} className="telegram-invite-history__item">
                      <div className="telegram-invite-history__meta">
                        <span
                          className={`telegram-invite-history__status telegram-invite-history__status--${statusKey}`}
                        >
                          {statusLabel}
                        </span>
                        <span className="telegram-invite-history__timestamp">{timestampLabel}</span>
                      </div>
                      <p className="telegram-invite-history__detail">
                        <strong>{t('projects.telegram.inviteHistory.chat')}:</strong>{' '}
                        {entry.chatId || t('common.notAvailable')}
                      </p>
                      {entry.link ? (
                        <p className="telegram-invite-history__detail">
                          <strong>{t('projects.telegram.inviteHistory.link')}:</strong>{' '}
                          <a href={entry.link} target="_blank" rel="noreferrer">
                            {entry.link}
                          </a>
                        </p>
                      ) : null}
                      {entry.message ? (
                        <p className="telegram-invite-history__message">
                          <strong>{t('projects.telegram.inviteHistory.message')}:</strong> {entry.message}
                        </p>
                      ) : null}
                      {entry.error ? (
                        <p className="telegram-invite-history__error">
                          <strong>{t('projects.telegram.inviteHistory.error')}:</strong> {entry.error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hint">{t('projects.telegram.inviteHistory.empty')}</p>
            )}
          </div>
        </InfoCard>
      ) : null}
      </div>
      {approveModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h3>{t('projects.approveModal.title')}</h3>
              <p className="modal-subtitle">{t('projects.approveModal.subtitle')}</p>
            </header>
            <div className="modal-content">
              <p className="modal-meta">{t('projects.approveModal.progress', { percent: briefProgressValue })}</p>
              {needsAttentionLabels.length > 0 ? (
                <div>
                  <h4>{t('projects.approveModal.needsAttentionTitle')}</h4>
                  <ul className="needs-attention-list">
                    {needsAttentionLabels.map((label) => (
                      <li key={`approve-${label}`}>{label}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>{t('projects.approveModal.noIssues')}</p>
              )}
            </div>
            <footer className="modal-footer">
              <button type="button" className="secondary-button" onClick={handleApproveModalClose}>
                {t('projects.approveModal.cancel')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleApproveModalConfirm}
                disabled={approveLoading}
              >
                {approveLoading ? t('common.loading') : t('projects.approveModal.confirm')}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {presetModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h3>{t('projects.presetModal.title')}</h3>
              <p className="modal-subtitle">{t('projects.presetModal.subtitle', { preset: presetName })}</p>
            </header>
            <div className="modal-content">
              {presetDraftSummary ? <p>{presetDraftSummary}</p> : null}
              {presetDraftMeta ? (
                <p className="modal-meta">
                  {t('projects.presetModal.meta', {
                    id: presetDraftMeta.id || '—',
                    industry: presetDraftMeta.industry || t('common.notAvailable')
                  })}
                </p>
              ) : null}
              {presetDraftSuggestions.length > 0 ? (
                <section>
                  <h4>{t('projects.presetModal.suggestions')}</h4>
                  <ul className="preset-draft-list">
                    {presetDraftSuggestions.map((item, index) => (
                      <li key={`suggestion-${index}`}>
                        <strong>{item.channel ? `${item.channel}: ` : ''}</strong>
                        {item.message || JSON.stringify(item)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {presetDraftQuestions.length > 0 ? (
                <section>
                  <h4>{t('projects.presetModal.questions')}</h4>
                  <ul className="preset-draft-list">
                    {presetDraftQuestions.map((item, index) => (
                      <li key={`question-${index}`}>{item.prompt || item.question || JSON.stringify(item)}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
            <footer className="modal-footer">
              <div className="modal-meta">
                {presetDraftGeneratedAt
                  ? t('projects.presetModal.updatedAt', {
                      date: new Date(presetDraftGeneratedAt).toLocaleString(locale)
                    })
                  : null}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleDismissPresetDraft}
                  disabled={presetReviewLoading}
                >
                  {presetReviewLoading ? t('common.loading') : t('projects.presetModal.dismiss')}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleApplyPresetDraft}
                  disabled={presetReviewLoading || isPresetLoading}
                >
                  {presetReviewLoading ? t('common.loading') : t('projects.presetModal.apply')}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => !presetReviewLoading && setPresetModalOpen(false)}
                  disabled={presetReviewLoading}
                >
                  {t('projects.presetModal.close')}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

ProjectsPage.propTypes = {
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      industry: PropTypes.string,
      description: PropTypes.string,
      deeplink: PropTypes.string,
      channels: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
      updatedAt: PropTypes.string.isRequired
    })
  ).isRequired,
  selectedProjectId: PropTypes.string,
  selectedProject: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    industry: PropTypes.string,
    description: PropTypes.string,
    channels: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    deeplink: PropTypes.string,
    briefStatus: PropTypes.string,
    briefProgress: PropTypes.number,
    needsAttention: PropTypes.object,
    presetId: PropTypes.string,
    presetVersion: PropTypes.string,
    presetDraft: PropTypes.object,
    tgContactStatus: PropTypes.string,
    tgLastInvitation: PropTypes.string
  }),
  onCreateProject: PropTypes.func.isRequired,
  onSelectProject: PropTypes.func.isRequired,
  onNotify: PropTypes.func.isRequired,
  botStatus: PropTypes.shape({
    status: PropTypes.string,
    running: PropTypes.bool,
    tokenStored: PropTypes.bool,
    username: PropTypes.string
  }),
  botBusy: PropTypes.bool,
  onStartBot: PropTypes.func,
  onStopBot: PropTypes.func,
  onRefreshBot: PropTypes.func,
  contacts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string,
      status: PropTypes.string,
      lastContactAt: PropTypes.string
    })
  ),
  contactsLoading: PropTypes.bool,
  onRefreshContacts: PropTypes.func,
  onSaveContact: PropTypes.func,
  onSendInvite: PropTypes.func,
  onApproveBrief: PropTypes.func,
  inviteHistory: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      timestamp: PropTypes.string,
      chatId: PropTypes.string,
      link: PropTypes.string,
      message: PropTypes.string,
      error: PropTypes.string
    })
  ),
  onRefreshInviteHistory: PropTypes.func,
  presetOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      version: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      description: PropTypes.string,
      updatedAt: PropTypes.string
    })
  ),
  presetsLoading: PropTypes.bool,
  presetDiff: PropTypes.shape({
    hasUpdate: PropTypes.bool,
    latestVersion: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    projectVersion: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    notes: PropTypes.arrayOf(PropTypes.string),
    meta: PropTypes.object
  }),
  presetBusy: PropTypes.bool,
  presetDiffLoading: PropTypes.bool,
  onApplyPreset: PropTypes.func,
  onClearPresetDraft: PropTypes.func,
  onRefreshPresetDiff: PropTypes.func,
  onOpenBrief: PropTypes.func
};
