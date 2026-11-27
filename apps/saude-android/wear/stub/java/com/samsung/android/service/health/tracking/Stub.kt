// STUB DE COMPILAÇÃO — usado só quando wear/libs/ não tem o .aar da Samsung.
// Serve para validar o resto do código; o APK gerado com este stub NÃO funciona no relógio.
// Assinaturas modeladas a partir da documentação pública do Samsung Health Sensor SDK.
@file:Suppress("unused", "UNUSED_PARAMETER")

package com.samsung.android.service.health.tracking

import android.app.Activity
import android.content.Context
import com.samsung.android.service.health.tracking.data.DataPoint
import com.samsung.android.service.health.tracking.data.HealthTrackerType

interface ConnectionListener {
    fun onConnectionSuccess()
    fun onConnectionEnded()
    fun onConnectionFailed(e: HealthTrackerException)
}

class HealthTrackerException(val errorCode: Int, message: String?) : Exception(message) {
    fun hasResolution(): Boolean = false
    fun resolve(activity: Activity) {}
}

class HealthTrackerCapability {
    val supportHealthTrackerTypes: List<HealthTrackerType> = emptyList()
}

class HealthTrackingService(listener: ConnectionListener, context: Context) {
    val trackingCapability: HealthTrackerCapability = HealthTrackerCapability()
    fun connectService() { error("stub") }
    fun disconnectService() {}
    fun getHealthTracker(type: HealthTrackerType): HealthTracker = error("stub")
    fun getHealthTracker(type: HealthTrackerType, leds: Set<com.samsung.android.service.health.tracking.data.PpgType>): HealthTracker = error("stub")
}

class HealthTracker {
    interface TrackerEventListener {
        fun onDataReceived(list: List<DataPoint>)
        fun onFlushCompleted()
        fun onError(error: TrackerError)
    }
    enum class TrackerError { PERMISSION_ERROR, SDK_POLICY_ERROR }
    fun setEventListener(listener: TrackerEventListener) {}
    fun unsetEventListener() {}
    fun flush(): Boolean = false
}
