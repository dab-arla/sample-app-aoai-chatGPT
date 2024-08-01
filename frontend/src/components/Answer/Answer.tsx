import { FormEvent, useContext, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { nord } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Checkbox, DefaultButton, Dialog, FontIcon, Stack, Text } from '@fluentui/react'
import { useBoolean } from '@fluentui/react-hooks'
import { ThumbDislike20Filled, ThumbLike20Filled } from '@fluentui/react-icons'
import DOMPurify from 'dompurify'
import remarkGfm from 'remark-gfm'
import supersub from 'remark-supersub'
import Plot from 'react-plotly.js'
import { AskResponse, Citation, Feedback, historyMessageFeedback } from '../../api'
import { XSSAllowTags, XSSAllowAttributes } from '../../constants/sanatizeAllowables'
import { AppStateContext } from '../../state/AppProvider'

import { parseAnswer } from './AnswerParser'

import styles from './Answer.module.css'

interface Props {
  answer: AskResponse
  onCitationClicked: (citedDocument: Citation) => void
  onExectResultClicked: () => void
}

export const Answer = ({ answer, onCitationClicked, onExectResultClicked }: Props) => {
  const initializeAnswerFeedback = (answer: AskResponse) => {
    if (answer.message_id == undefined) return undefined
    if (answer.feedback == undefined) return undefined
    if (answer.feedback.split(',').length > 1) return Feedback.Negative
    if (Object.values(Feedback).includes(answer.feedback)) return answer.feedback
    return Feedback.Neutral
  }

  const [isRefAccordionOpen, { toggle: toggleIsRefAccordionOpen }] = useBoolean(false)
  const filePathTruncationLimit = 50

  const parsedAnswer = useMemo(() => parseAnswer(answer), [answer])
  const [chevronIsExpanded, setChevronIsExpanded] = useState(isRefAccordionOpen)
  const [feedbackState, setFeedbackState] = useState(initializeAnswerFeedback(answer))
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false)
  const [showReportInappropriateFeedback, setShowReportInappropriateFeedback] = useState(false)
  const [negativeFeedbackList, setNegativeFeedbackList] = useState<Feedback[]>([])
  const appStateContext = useContext(AppStateContext)
  const FEEDBACK_ENABLED =
    appStateContext?.state.frontendSettings?.feedback_enabled && appStateContext?.state.isCosmosDBAvailable?.cosmosDB
  const SANITIZE_ANSWER = appStateContext?.state.frontendSettings?.sanitize_answer

  const handleChevronClick = () => {
    setChevronIsExpanded(!chevronIsExpanded)
    toggleIsRefAccordionOpen()
  }

  useEffect(() => {
    setChevronIsExpanded(isRefAccordionOpen)
  }, [isRefAccordionOpen])

  useEffect(() => {
    if (answer.message_id == undefined) return

    let currentFeedbackState
    if (appStateContext?.state.feedbackState && appStateContext?.state.feedbackState[answer.message_id]) {
      currentFeedbackState = appStateContext?.state.feedbackState[answer.message_id]
    } else {
      currentFeedbackState = initializeAnswerFeedback(answer)
    }
    setFeedbackState(currentFeedbackState)
  }, [appStateContext?.state.feedbackState, feedbackState, answer.message_id])

  const createCitationFilepath = (citation: Citation, index: number, truncate: boolean = false) => {
    let citationFilename = ''

    if (citation.filepath) {
      const part_i = citation.part_index ?? (citation.chunk_id ? parseInt(citation.chunk_id) + 1 : '')
      if (truncate && citation.filepath.length > filePathTruncationLimit) {
        const citationLength = citation.filepath.length
        citationFilename = `${citation.filepath.substring(0, 20)}...${citation.filepath.substring(citationLength - 20)} - Part ${part_i}`
      } else {
        citationFilename = `${citation.filepath} - Part ${part_i}`
      }
    } else if (citation.filepath && citation.reindex_id) {
      citationFilename = `${citation.filepath} - Part ${citation.reindex_id}`
    } else {
      citationFilename = `Citation ${index}`
    }
    return citationFilename
  }

  const onLikeResponseClicked = async () => {
    if (answer.message_id == undefined) return

    let newFeedbackState = feedbackState
    // Set or unset the thumbs up state
    if (feedbackState == Feedback.Positive) {
      newFeedbackState = Feedback.Neutral
    } else {
      newFeedbackState = Feedback.Positive
    }
    appStateContext?.dispatch({
      type: 'SET_FEEDBACK_STATE',
      payload: { answerId: answer.message_id, feedback: newFeedbackState }
    })
    setFeedbackState(newFeedbackState)

    // Update message feedback in db
    await historyMessageFeedback(answer.message_id, newFeedbackState)
  }

  const onDislikeResponseClicked = async () => {
    if (answer.message_id == undefined) return

    let newFeedbackState = feedbackState
    if (feedbackState === undefined || feedbackState === Feedback.Neutral || feedbackState === Feedback.Positive) {
      newFeedbackState = Feedback.Negative
      setFeedbackState(newFeedbackState)
      setIsFeedbackDialogOpen(true)
    } else {
      // Reset negative feedback to neutral
      newFeedbackState = Feedback.Neutral
      setFeedbackState(newFeedbackState)
      await historyMessageFeedback(answer.message_id, Feedback.Neutral)
    }
    appStateContext?.dispatch({
      type: 'SET_FEEDBACK_STATE',
      payload: { answerId: answer.message_id, feedback: newFeedbackState }
    })
  }

  const updateFeedbackList = (ev?: FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
    if (answer.message_id == undefined) return
    const selectedFeedback = (ev?.target as HTMLInputElement)?.id as Feedback

    let feedbackList = negativeFeedbackList.slice()
    if (checked) {
      feedbackList.push(selectedFeedback)
    } else {
      feedbackList = feedbackList.filter(f => f !== selectedFeedback)
    }

    setNegativeFeedbackList(feedbackList)
  }

  const onSubmitNegativeFeedback = async () => {
    if (answer.message_id == undefined) return
    await historyMessageFeedback(answer.message_id, negativeFeedbackList.join(','))
    resetFeedbackDialog()
  }

  const resetFeedbackDialog = () => {
    setIsFeedbackDialogOpen(false)
    setShowReportInappropriateFeedback(false)
    setNegativeFeedbackList([])
  }

  const UnhelpfulFeedbackContent = () => {
    return (
      <>
        <div>Warum war diese Antwort nicht hilfreich?</div>
        <Stack tokens={{ childrenGap: 4 }}>
          <Checkbox
            label="Quellenangaben fehlen"
            id={Feedback.MissingCitation}
            defaultChecked={negativeFeedbackList.includes(Feedback.MissingCitation)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Quellenangaben sind falsch"
            id={Feedback.WrongCitation}
            defaultChecked={negativeFeedbackList.includes(Feedback.WrongCitation)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="die Antwort stammt nicht aus meinen Daten"
            id={Feedback.OutOfScope}
            defaultChecked={negativeFeedbackList.includes(Feedback.OutOfScope)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="ungenau oder irrelevant"
            id={Feedback.InaccurateOrIrrelevant}
            defaultChecked={negativeFeedbackList.includes(Feedback.InaccurateOrIrrelevant)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="anderes"
            id={Feedback.OtherUnhelpful}
            defaultChecked={negativeFeedbackList.includes(Feedback.OtherUnhelpful)}
            onChange={updateFeedbackList}></Checkbox>
        </Stack>
        <div onClick={() => setShowReportInappropriateFeedback(true)} style={{ color: '#ba0020', cursor: 'pointer' }}>
          Unangemessenen Inhalte melden
        </div>
      </>
    )
  }

  const ReportInappropriateFeedbackContent = () => {
    return (
      <>
        <div>
          Der Inhalt enhält <span style={{ color: 'red' }}>*</span>
        </div>
        <Stack tokens={{ childrenGap: 4 }}>
          <Checkbox
            label="Hassrede, Stereotypen, herabwürdigende Aussagen"
            id={Feedback.HateSpeech}
            defaultChecked={negativeFeedbackList.includes(Feedback.HateSpeech)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Verherrlichung von Gewalt oder Selbstverletzung"
            id={Feedback.Violent}
            defaultChecked={negativeFeedbackList.includes(Feedback.Violent)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="sexuelle Inhalte"
            id={Feedback.Sexual}
            defaultChecked={negativeFeedbackList.includes(Feedback.Sexual)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="manipulative Inhalte, die hinterlistig, emotional unangebracht oder aufdringlich sind"
            defaultChecked={negativeFeedbackList.includes(Feedback.Manipulative)}
            id={Feedback.Manipulative}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="anderes"
            id={Feedback.OtherHarmful}
            defaultChecked={negativeFeedbackList.includes(Feedback.OtherHarmful)}
            onChange={updateFeedbackList}></Checkbox>
        </Stack>
      </>
    )
  }

  const components = {
    code({ node, ...props }: { node: any;[key: string]: any }) {
      let language
      if (props.className) {
        const match = props.className.match(/language-(\w+)/)
        language = match ? match[1] : undefined
      }
      const codeString = node.children[0].value ?? ''
      return (
        <SyntaxHighlighter style={nord} language={language} PreTag="div" {...props}>
          {codeString}
        </SyntaxHighlighter>
      )
    }
  }
  return (
    <>
      <Stack className={styles.answerContainer} tabIndex={0}>
        <Stack.Item>
          <Stack horizontal grow>
            <Stack.Item grow>
              <ReactMarkdown
                linkTarget="_blank"
                remarkPlugins={[remarkGfm, supersub]}
                children={
                  SANITIZE_ANSWER
                    ? DOMPurify.sanitize(parsedAnswer.markdownFormatText, { ALLOWED_TAGS: XSSAllowTags, ALLOWED_ATTR: XSSAllowAttributes })
                    : parsedAnswer.markdownFormatText
                }
                className={styles.answerText}
                components={components}
              />
            </Stack.Item>
            <Stack.Item className={styles.answerHeader}>
              {FEEDBACK_ENABLED && answer.message_id !== undefined && (
                <Stack horizontal horizontalAlign="space-between">
                  <ThumbLike20Filled
                    aria-hidden="false"
                    aria-label="Like this response"
                    onClick={() => onLikeResponseClicked()}
                    style={
                      feedbackState === Feedback.Positive ||
                        appStateContext?.state.feedbackState[answer.message_id] === Feedback.Positive
                        ? { color: 'darkgreen', cursor: 'pointer' }
                        : { color: 'slategray', cursor: 'pointer' }
                    }
                  />
                  <ThumbDislike20Filled
                    aria-hidden="false"
                    aria-label="Dislike this response"
                    onClick={() => onDislikeResponseClicked()}
                    style={
                      feedbackState !== Feedback.Positive &&
                        feedbackState !== Feedback.Neutral &&
                        feedbackState !== undefined
                        ? { color: 'darkred', cursor: 'pointer' }
                        : { color: 'slategray', cursor: 'pointer' }
                    }
                  />
                </Stack>
              )}
            </Stack.Item>
          </Stack>
        </Stack.Item>
        {parsedAnswer.plotly_data !== null && (
          <Stack className={styles.answerContainer}>
            <Stack.Item grow>
              <Plot data={parsedAnswer.plotly_data.data} layout={parsedAnswer.plotly_data.layout} />
            </Stack.Item>
          </Stack>
        )}
        <Stack horizontal className={styles.answerFooter}>
          {!!parsedAnswer.citations.length && (
            <Stack.Item onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}>
              <Stack style={{ width: '100%' }}>
                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                  <Text
                    className={styles.accordionTitle}
                    onClick={toggleIsRefAccordionOpen}
                    aria-label="Open references"
                    tabIndex={0}
                    role="button">
                    <span>
                      {parsedAnswer.citations.length > 1
                        ? parsedAnswer.citations.length + ' references'
                        : '1 reference'}
                    </span>
                  </Text>
                  <FontIcon
                    className={styles.accordionIcon}
                    onClick={handleChevronClick}
                    iconName={chevronIsExpanded ? 'ChevronDown' : 'ChevronRight'}
                  />
                </Stack>
              </Stack>
            </Stack.Item>
          )}
          <Stack.Item className={styles.answerDisclaimerContainer}>
            <span className={styles.answerDisclaimer}>Von KI generierte Inhalte können fehlerhaft sein</span>
          </Stack.Item>
          {!!answer.exec_results?.length && (
            <Stack.Item onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}>
              <Stack style={{ width: '100%' }}>
                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                  <Text
                    className={styles.accordionTitle}
                    onClick={() => onExectResultClicked()}
                    aria-label="Open Intents"
                    tabIndex={0}
                    role="button">
                    <span>
                      Show Intents
                    </span>
                  </Text>
                  <FontIcon
                    className={styles.accordionIcon}
                    onClick={handleChevronClick}
                    iconName={'ChevronRight'}
                  />
                </Stack>
              </Stack>
            </Stack.Item>
          )}
        </Stack>
        {chevronIsExpanded && (
          <div className={styles.citationWrapper}>
            {parsedAnswer.citations.map((citation, idx) => {
              return (
                <span
                  title={createCitationFilepath(citation, ++idx)}
                  tabIndex={0}
                  role="link"
                  key={idx}
                  onClick={() => onCitationClicked(citation)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? onCitationClicked(citation) : null)}
                  className={styles.citationContainer}
                  aria-label={createCitationFilepath(citation, idx)}>
                  <div className={styles.citation}>{idx}</div>
                  {createCitationFilepath(citation, idx, true)}
                </span>
              )
            })}
          </div>
        )}
      </Stack>
      <Dialog
        onDismiss={() => {
          resetFeedbackDialog()
          setFeedbackState(Feedback.Neutral)
        }}
        hidden={!isFeedbackDialogOpen}
        styles={{
          main: [
            {
              selectors: {
                ['@media (min-width: 480px)']: {
                  maxWidth: '600px',
                  background: '#FFFFFF',
                  boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  maxHeight: '600px',
                  minHeight: '100px'
                }
              }
            }
          ]
        }}
        dialogContentProps={{
          title: 'Feedback einreichen',
          showCloseButton: true
        }}>
        <Stack tokens={{ childrenGap: 4 }}>
          <div>Dein Feedback hilft uns besser zu werden.</div>

          {!showReportInappropriateFeedback ? <UnhelpfulFeedbackContent /> : <ReportInappropriateFeedbackContent />}

          <div>Durch Klicken auf „Absenden“ wird dein Feedback an das Entwicklerteam übermittelt.</div>

          <DefaultButton disabled={negativeFeedbackList.length < 1} onClick={onSubmitNegativeFeedback}>
            Absenden
          </DefaultButton>
        </Stack>
      </Dialog>
    </>
  )
}
