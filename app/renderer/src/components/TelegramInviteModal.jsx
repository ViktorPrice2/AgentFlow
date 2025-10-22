import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useI18n } from '../i18n/useI18n.jsx';

export default function TelegramInviteModal({ open, invite, onClose }) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState(null);

  useEffect(() => {
    if (!open) {
      setCopyState(null);
    }
  }, [open]);

  const shareLink = typeof invite?.link === 'string' ? invite.link : '';
  const protocolLink = typeof invite?.protocolLink === 'string' ? invite.protocolLink : '';
  const webLink = typeof invite?.webLink === 'string' ? invite.webLink : '';
  const chatLabel = useMemo(() => {
    if (!invite) {
      return '';
    }

    const candidate =
      invite.displayChatId ??
      invite.resolvedChatId ??
      invite.rawChatId ??
      invite.chatId ??
      '';

    return candidate !== undefined && candidate !== null ? String(candidate) : '';
  }, [invite]);

  const handleCopy = async (value, key) => {
    if (!value) {
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopyState(key);
      setTimeout(() => {
        setCopyState(null);
      }, 2000);
    } catch (error) {
      console.warn('Failed to copy Telegram invite link', error);
    }
  };

  const handleOpen = (url) => {
    if (!url) {
      return;
    }

    try {
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      console.warn('Failed to open Telegram invite link', error);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal telegram-invite-modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <h3>{t('projects.telegram.inviteModal.title')}</h3>
          <p className="modal-subtitle">{t('projects.telegram.inviteModal.subtitle')}</p>
        </header>
        <div className="modal-content">
          {chatLabel ? (
            <p className="modal-meta">
              {t('projects.telegram.inviteModal.contact', { chat: chatLabel })}
            </p>
          ) : null}

          <div className="telegram-invite-modal__section">
            <h4>{t('projects.telegram.inviteModal.primaryLink')}</h4>
            <p className="telegram-invite-modal__hint">
              {t('projects.telegram.inviteModal.copyHint')}
            </p>
            <div className="telegram-invite-modal__field">
              <code>{shareLink}</code>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleCopy(shareLink, 'link')}
                disabled={!shareLink}
              >
                {copyState === 'link'
                  ? t('projects.telegram.inviteModal.copied')
                  : t('projects.telegram.inviteModal.copy')}
              </button>
            </div>
            <div className="telegram-invite-modal__actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => handleOpen(shareLink)}
                disabled={!shareLink}
              >
                {t('projects.telegram.inviteModal.openLink')}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleOpen(protocolLink)}
                disabled={!protocolLink}
              >
                {t('projects.telegram.inviteModal.openTelegram')}
              </button>
            </div>
          </div>

          {webLink ? (
            <div className="telegram-invite-modal__section">
              <h4>{t('projects.telegram.inviteModal.webFallback')}</h4>
              <div className="telegram-invite-modal__field">
                <code>{webLink}</code>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleCopy(webLink, 'web')}
                >
                  {copyState === 'web'
                    ? t('projects.telegram.inviteModal.copied')
                    : t('projects.telegram.inviteModal.copy')}
                </button>
              </div>
              <div className="telegram-invite-modal__actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleOpen(webLink)}
                >
                  {t('projects.telegram.inviteModal.openLink')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="telegram-invite-modal__section">
            <h4>{t('projects.telegram.inviteModal.stepsTitle')}</h4>
            <ol className="telegram-invite-modal__steps">
              <li>{t('projects.telegram.inviteModal.steps.share')}</li>
              <li>{t('projects.telegram.inviteModal.steps.start')}</li>
              <li>{t('projects.telegram.inviteModal.steps.resume')}</li>
            </ol>
            <p className="telegram-invite-modal__note">
              {t('projects.telegram.inviteModal.note')}
            </p>
          </div>
        </div>
        <footer className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}

TelegramInviteModal.propTypes = {
  open: PropTypes.bool,
  invite: PropTypes.shape({
    link: PropTypes.string,
    protocolLink: PropTypes.string,
    webLink: PropTypes.string,
    displayChatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    resolvedChatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    rawChatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }),
  onClose: PropTypes.func
};

TelegramInviteModal.defaultProps = {
  open: false,
  invite: null,
  onClose: () => {}
};
