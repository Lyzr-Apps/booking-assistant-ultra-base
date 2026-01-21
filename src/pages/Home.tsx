/**
 * Chat Widget Application
 *
 * A floating chat widget for website marketing with AI-powered agent responses.
 * Features: collapsible widget, message persistence, quick replies, typing indicator
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  MessageCircle,
  X,
  Send,
  Minus,
  Sparkles,
  Bot,
  User,
  Clock,
  CheckCircle,
  ExternalLink
} from 'lucide-react'
import { callAIAgent } from '@/utils/aiAgent'
import { cn } from '@/lib/utils'

// =============================================================================
// TypeScript Interfaces (from REAL response schema)
// =============================================================================

interface LeadQualification {
  is_qualified: boolean
  interest_level: string
  next_action: string
}

interface AgentResult {
  message: string
  lead_qualification: LeadQualification
  sources_used: any[]
  suggested_actions: string[]
}

interface AgentResponse {
  status: 'success' | 'error'
  result: AgentResult
  metadata: {
    agent_name: string
    timestamp: string
  }
}

interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  suggested_actions?: string[]
  lead_qualification?: LeadQualification
}

interface ChatState {
  messages: Message[]
  sessionId: string
  userId: string
}

// =============================================================================
// Constants
// =============================================================================

const AGENT_ID = '69704e18d6d0dcaec1115d28'
const STORAGE_KEY = 'chat_widget_state'
const AUTO_GREETING_DELAY = 5000 // 5 seconds
const MAX_CHAR_LIMIT = 250

const INITIAL_GREETING = "Hi! Welcome to our website. I'm here to help you learn about our services, pricing, and availability. How can I assist you today?"

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function generateUserId(): string {
  let userId = localStorage.getItem('chat_user_id')
  if (!userId) {
    userId = `user-${generateId()}`
    localStorage.setItem('chat_user_id', userId)
  }
  return userId
}

function generateSessionId(): string {
  return `session-${generateId()}`
}

function loadChatState(): ChatState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Convert timestamp strings back to Date objects
      parsed.messages = parsed.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
      return parsed
    }
  } catch (error) {
    console.error('Failed to load chat state:', error)
  }
  return null
}

function saveChatState(state: ChatState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save chat state:', error)
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}

// =============================================================================
// Sub-Components
// =============================================================================

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 rounded-2xl rounded-bl-sm max-w-[80%]">
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3 items-start', isUser && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={cn(
          isUser ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
        )}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        <div className={cn(
          'px-4 py-3 rounded-2xl shadow-sm',
          isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        )}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>

        <div className="flex items-center gap-2 px-2">
          <Clock className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-500">
            {formatTimestamp(message.timestamp)}
          </span>

          {message.lead_qualification && message.lead_qualification.is_qualified && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle className="h-3 w-3 mr-1" />
              Qualified Lead
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickReplyButtons({
  actions,
  onSelect
}: {
  actions: string[]
  onSelect: (action: string) => void
}) {
  if (!actions || actions.length === 0) return null

  return (
    <div className="px-4 pb-3">
      <p className="text-xs text-gray-500 mb-2">Quick replies:</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => onSelect(action)}
            className="text-xs"
          >
            {action}
          </Button>
        ))}
      </div>
    </div>
  )
}

function BookingCTA({
  message,
  qualification
}: {
  message: string
  qualification?: LeadQualification
}) {
  // Show booking CTA if lead is qualified and next action is booking-related
  if (!qualification?.is_qualified) return null
  if (!qualification.next_action?.toLowerCase().includes('book')) return null

  return (
    <Card className="mx-4 mb-3 border-purple-200 bg-purple-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-500 rounded-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-gray-900 mb-1">
              Ready to book?
            </h4>
            <p className="text-xs text-gray-600 mb-3">
              We'd love to help you get started. Click below to schedule your appointment.
            </p>
            <Button
              size="sm"
              className="bg-purple-500 hover:bg-purple-600 text-white"
              onClick={() => window.open('https://calendly.com/your-booking-link', '_blank')}
            >
              Book Now
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Main Chat Widget Component
// =============================================================================

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId] = useState(generateSessionId)
  const [userId] = useState(generateUserId)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [currentQuickReplies, setCurrentQuickReplies] = useState<string[]>([])
  const [hasShownGreeting, setHasShownGreeting] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Load chat state from localStorage on mount
  useEffect(() => {
    const savedState = loadChatState()
    if (savedState && savedState.messages.length > 0) {
      setMessages(savedState.messages)
      setHasShownGreeting(true)

      // Extract quick replies from last agent message
      const lastAgentMsg = [...savedState.messages].reverse().find(m => m.role === 'agent')
      if (lastAgentMsg?.suggested_actions && lastAgentMsg.suggested_actions.length > 0) {
        setCurrentQuickReplies(lastAgentMsg.suggested_actions)
        setShowQuickReplies(true)
      }
    }
  }, [])

  // Save chat state to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatState({ messages, sessionId, userId })
    }
  }, [messages, sessionId, userId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Auto-greeting after 5 seconds for new visitors
  useEffect(() => {
    if (!hasShownGreeting && messages.length === 0) {
      const timer = setTimeout(() => {
        const greetingMessage: Message = {
          id: generateId(),
          role: 'agent',
          content: INITIAL_GREETING,
          timestamp: new Date(),
          suggested_actions: ['View Services', 'Check Availability', 'Pricing Info', 'Book Now']
        }
        setMessages([greetingMessage])
        setCurrentQuickReplies(greetingMessage.suggested_actions || [])
        setShowQuickReplies(true)
        setHasShownGreeting(true)
      }, AUTO_GREETING_DELAY)

      return () => clearTimeout(timer)
    }
  }, [hasShownGreeting, messages.length])

  // Handle sending message
  const handleSendMessage = async (text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) return

    // Hide quick replies when user sends a message
    setShowQuickReplies(false)

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmedText,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    try {
      // Call AI agent with user message
      const result = await callAIAgent(trimmedText, AGENT_ID, {
        user_id: userId,
        session_id: sessionId
      })

      setIsTyping(false)

      if (result.success && result.response.status === 'success') {
        const agentData = result.response.result as AgentResult

        // Add agent message with response data
        const agentMessage: Message = {
          id: generateId(),
          role: 'agent',
          content: agentData.message || 'I apologize, I could not generate a response.',
          timestamp: new Date(),
          suggested_actions: agentData.suggested_actions,
          lead_qualification: agentData.lead_qualification
        }

        setMessages(prev => [...prev, agentMessage])

        // Update quick replies if available
        if (agentData.suggested_actions && agentData.suggested_actions.length > 0) {
          setCurrentQuickReplies(agentData.suggested_actions)
          setShowQuickReplies(true)
        }
      } else {
        // Error response
        const errorMessage: Message = {
          id: generateId(),
          role: 'agent',
          content: 'I apologize, but I encountered an issue processing your request. Please try again.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      setIsTyping(false)
      console.error('Chat error:', error)

      const errorMessage: Message = {
        id: generateId(),
        role: 'agent',
        content: 'I apologize, but I encountered a network error. Please check your connection and try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleQuickReply = (action: string) => {
    handleSendMessage(action)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(inputValue)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value.length <= MAX_CHAR_LIMIT) {
      setInputValue(value)
    }
  }

  // Get latest lead qualification data
  const latestQualification = [...messages]
    .reverse()
    .find(m => m.role === 'agent' && m.lead_qualification)?.lead_qualification

  // Collapsed state - floating button
  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-16 w-16 rounded-full shadow-2xl bg-purple-500 hover:bg-purple-600 animate-bounce"
        style={{ animationDuration: '2s' }}
      >
        <MessageCircle className="h-8 w-8 text-white" />
      </Button>
    )
  }

  // Expanded state - chat window
  return (
    <Card className="fixed bottom-6 right-6 w-[400px] h-[500px] shadow-2xl flex flex-col overflow-hidden border-2 border-purple-200">
      {/* Header */}
      <CardHeader className="p-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white">
              <AvatarFallback className="bg-purple-700">
                <Bot className="h-5 w-5 text-white" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-sm">Marketing Assistant</h3>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 bg-green-400 rounded-full" />
                <span className="text-xs text-purple-100">Online</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0 hover:bg-purple-600 text-white"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([])
                setHasShownGreeting(false)
                localStorage.removeItem(STORAGE_KEY)
              }}
              className="h-8 w-8 p-0 hover:bg-purple-600 text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isTyping && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Booking CTA (shown when qualified) */}
      {latestQualification && (
        <BookingCTA
          message={messages[messages.length - 1]?.content || ''}
          qualification={latestQualification}
        />
      )}

      {/* Quick Reply Buttons */}
      {showQuickReplies && currentQuickReplies.length > 0 && !isTyping && (
        <>
          <Separator />
          <QuickReplyButtons actions={currentQuickReplies} onSelect={handleQuickReply} />
        </>
      )}

      <Separator />

      {/* Input Section */}
      <div className="p-4 bg-gray-50">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="resize-none"
              disabled={isTyping}
            />
            <p className="text-xs text-gray-400 mt-1">
              {inputValue.length}/{MAX_CHAR_LIMIT}
            </p>
          </div>
          <Button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isTyping}
            className="bg-purple-500 hover:bg-purple-600"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-blue-50">
      {/* Demo website content */}
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Welcome to Our Service
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Experience our AI-powered marketing assistant
          </p>
          <Badge className="bg-purple-500 text-white px-4 py-2 text-sm">
            <Sparkles className="h-4 w-4 mr-2" />
            Try the chat widget in the bottom-right corner!
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mt-16">
          <Card>
            <CardHeader>
              <h3 className="text-xl font-semibold">Our Services</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                We offer comprehensive solutions tailored to your needs. Ask our AI assistant about pricing, availability, and booking options.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-semibold">Quick Assistance</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Our intelligent chat widget provides instant answers to your questions. Get personalized recommendations and book appointments easily.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-semibold">24/7 Availability</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Get help whenever you need it. Our AI assistant is always ready to answer your questions and guide you through the booking process.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-semibold">Personalized Experience</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                We understand your needs and provide tailored recommendations based on your interests and requirements.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <p className="text-gray-500 text-sm">
            Click the chat icon in the bottom-right to get started!
          </p>
        </div>
      </div>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  )
}
