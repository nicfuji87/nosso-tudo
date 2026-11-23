package app.nossotudo.saude.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * P0 do redesenho: sair da tela Coração/VFC fechava o minuto em andamento mesmo com a coleta contínua rodando.
 * O minuto parcial ia para a fila e o minuto completo (mesmo horário) era ignorado pelo upsert do servidor.
 */
class MonitorCardiacoTest {
    @Test fun comColetaContinua_naoFechaMinuto() {
        assertFalse(MonitorCardiaco.deveFecharMinuto(eraDonoDoSensor = false, servicoRodando = true))
        assertFalse("mesmo se a tela ligou o sensor, o serviço é quem fecha o minuto", MonitorCardiaco.deveFecharMinuto(true, true))
    }

    @Test fun telaQueLigouOSensor_semServico_fechaMinuto() {
        assertTrue(MonitorCardiaco.deveFecharMinuto(eraDonoDoSensor = true, servicoRodando = false))
    }

    @Test fun telaQueNaoLigouSensor_naoFecha() {
        assertFalse(MonitorCardiaco.deveFecharMinuto(eraDonoDoSensor = false, servicoRodando = false))
    }
}
