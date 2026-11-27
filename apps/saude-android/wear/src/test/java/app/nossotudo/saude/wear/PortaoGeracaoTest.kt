package app.nossotudo.saude.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Regressões da revisão do PR #19 (v0.9.8): callbacks antigos e fila de lacunas. */
class PortaoGeracaoTest {
    private val lote = EstadoSaude.ResultadoLote(validos = 3, foraDoPulso = false)

    @Test fun callbackAntigo_naoGravaBatimento() {
        val portao = PortaoGeracao()
        portao.abrir(1)
        var gravados = 0
        assertNotNull(CallbacksSensor.aoReceberLote(portao, 1) { gravados++; lote })
        portao.fechar()                                   // religar: desconexão intencional
        portao.abrir(2)
        assertNull("geração 1 não grava depois de religar", CallbacksSensor.aoReceberLote(portao, 1) { gravados++; lote })
        assertEquals(1, gravados)
        assertNotNull(CallbacksSensor.aoReceberLote(portao, 2) { gravados++; lote })
        assertEquals(2, gravados)
    }

    @Test fun entreFecharEAbrir_nenhumCallbackPassa() {
        val portao = PortaoGeracao()
        portao.abrir(1)
        portao.fechar()
        var chamou = false
        assertNull(CallbacksSensor.aoReceberLote(portao, 1) { chamou = true; lote })
        assertFalse(chamou)
    }

    /** Callbacks em várias threads × troca de geração: depois que abrir(2) retorna, a geração 1 não grava mais. */
    @Test fun corrida_trocaDeGeracao_naoDeixaGravacaoAtrasada() {
        repeat(20) {
            val portao = PortaoGeracao()
            portao.abrir(1)
            val trocou = AtomicBoolean(false)
            val gravadosDepois = AtomicInteger(0)
            val pool = Executors.newFixedThreadPool(8)
            val inicio = CountDownLatch(1)
            repeat(8) {
                pool.submit {
                    inicio.await()
                    repeat(2_000) {
                        CallbacksSensor.aoReceberLote(portao, 1) {
                            if (trocou.get()) gravadosDepois.incrementAndGet()
                            lote
                        }
                    }
                }
            }
            inicio.countDown()
            Thread.sleep(2)
            portao.fechar(); portao.abrir(2); trocou.set(true) // troca sob o lock; marcador depois do retorno
            pool.shutdown()
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
            assertEquals("nenhuma gravação da geração 1 após a troca", 0, gravadosDepois.get())
        }
    }

    @Test fun onFim_deConexaoAntiga_naoSeguraTrava() {
        val portao = PortaoGeracao()
        portao.abrir(1)
        var travas = 0
        var processados = 0
        portao.fechar(); portao.abrir(2)                   // religou: a conexão 1 foi desconectada por nós
        val tratou = CallbacksSensor.aoFimDaConexao(portao, 1, { travas++ }, { processados++ })
        assertFalse(tratou)
        assertEquals("desconexão intencional não acorda o processador", 0, travas)
        assertEquals(0, processados)
        assertTrue(CallbacksSensor.aoFimDaConexao(portao, 2, { travas++ }, { processados++ }))
        assertEquals(1, travas)
        assertEquals(1, processados)
    }

    @Test fun onFim_comServicoParando_naoSeguraTrava() {
        val portao = PortaoGeracao()
        portao.abrir(5)
        portao.fechar()                                   // onDestroy
        var travas = 0
        assertFalse(CallbacksSensor.aoFimDaConexao(portao, 5, { travas++ }, {}))
        assertEquals(0, travas)
    }

    @Test fun pendencias_incluemLacunas() {
        assertTrue("lacunas" in FilasEnvio.TODAS)
        val tamanhos = mapOf("lacunas" to 3)
        assertEquals("só lacunas na fila ainda conta como pendente", 3, FilasEnvio.pendentes { tamanhos[it] ?: 0 })
        val todas = FilasEnvio.TODAS.associateWith { 1 }
        assertEquals(FilasEnvio.TODAS.size, FilasEnvio.pendentes { todas.getValue(it) })
    }
}
