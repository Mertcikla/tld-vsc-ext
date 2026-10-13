import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '../../tld/frontend/src/App'
import theme from '../../tld/frontend/src/theme'
import { ToastContainer } from '../../tld/frontend/src/utils/toast'
import { PlatformProvider } from '../../tld/frontend/src/platform/PlatformContext'
import { platform } from '../../tld/frontend/src/platform/local'
import RepositoryChanges from './RepositoryChanges'
import { ThemeProvider } from '../../tld/frontend/src/context/ThemeContext'
import { ConnectorStyleProvider } from '../../tld/frontend/src/context/ConnectorStyleContext'
import '../../tld/frontend/src/index.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: false } } })
const target = window.__TLD_REPOSITORY_CHANGE__
const initialPath = window.__TLD_DIAGRAM_ID__ != null ? `/views/${window.__TLD_DIAGRAM_ID__}` : '/views'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <PlatformProvider platform={platform}>
          <MemoryRouter initialEntries={[initialPath]}>
            {target ? <ThemeProvider><ConnectorStyleProvider><RepositoryChanges initialTarget={target} /></ConnectorStyleProvider></ThemeProvider> : <App />}
          </MemoryRouter>
          <ToastContainer />
        </PlatformProvider>
      </ChakraProvider>
    </QueryClientProvider>
  </StrictMode>,
)
