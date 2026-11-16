// STUB DE COMPILAÇÃO — ver Stub.kt
@file:Suppress("unused")

package com.samsung.android.service.health.tracking.data

enum class HealthTrackerType {
    HEART_RATE_CONTINUOUS, PPG_CONTINUOUS, ACCELEROMETER_CONTINUOUS,
    SKIN_TEMPERATURE_CONTINUOUS, ECG_ON_DEMAND, SPO2_ON_DEMAND,
}

enum class PpgType { GREEN, IR, RED }

class ValueKey<T> {
    object HeartRateSet {
        @JvmField val HEART_RATE = ValueKey<Int>()
        @JvmField val HEART_RATE_STATUS = ValueKey<Int>()
        @JvmField val IBI_LIST = ValueKey<List<Int>>()
        @JvmField val IBI_STATUS_LIST = ValueKey<List<Int>>()
    }
    object SkinTemperatureSet {
        @JvmField val OBJECT_TEMPERATURE = ValueKey<Float>()
        @JvmField val AMBIENT_TEMPERATURE = ValueKey<Float>()
        @JvmField val STATUS = ValueKey<Int>()
    }
    object EcgSet {
        @JvmField val ECG_MV = ValueKey<Float>()
        @JvmField val LEAD_OFF = ValueKey<Int>()
    }
}

class DataPoint {
    val timestamp: Long = 0
    fun <T> getValue(key: ValueKey<T>): T? = null
}
