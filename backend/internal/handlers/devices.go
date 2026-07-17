package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	_ "telemetryhub/internal/auth"
)

// DeviceRow represents a device with its field count and broker attribution.
type DeviceRow struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	DeviceType string    `json:"device_type"`
	FirstSeen  time.Time `json:"first_seen"`
	LastSeen   time.Time `json:"last_seen"`
	FieldCount int       `json:"field_count"`
	BrokerName string    `json:"broker_name"`
}

// ReadingResult represents a sensor reading with metadata.
type ReadingResult struct {
	Bucket      time.Time `json:"bucket"`
	FieldName   string    `json:"field_name"`
	DisplayName string    `json:"display_name"`
	Unit        string    `json:"unit"`
	Value       float64   `json:"value"`
}

// FieldRename represents a field rename configuration.
type FieldRename struct {
	DeviceID            string  `json:"device_id"`
	RawField            string  `json:"raw_field"`
	DisplayName         *string `json:"display_name,omitempty"`
	Unit                *string `json:"unit,omitempty"`
	ChartGroup          *string `json:"chart_group,omitempty"`
	SubGroup            *string `json:"sub_group,omitempty"`
	GroupDescription    *string `json:"group_description,omitempty"`
	SubGroupDescription *string `json:"sub_group_description,omitempty"`
	GroupSortOrder      *int    `json:"group_sort_order,omitempty"`
	SubGroupSortOrder   *int    `json:"sub_group_sort_order,omitempty"`
}

// DeviceStore defines the interface for device operations.
type DeviceStore interface {
	GetDevices(ctx context.Context) ([]DeviceRow, error)
	GetDeviceFields(ctx context.Context, deviceID string) ([]string, error)
	UpdateDevice(ctx context.Context, deviceID, name, deviceType string) error
	DeleteDevice(ctx context.Context, deviceID string) error
	DeleteDeviceField(ctx context.Context, deviceID, fieldName string) error
	GetReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) ([]ReadingResult, error)
	ListRenames(ctx context.Context, deviceID string) ([]FieldRename, error)
	CreateRename(ctx context.Context, deviceID, rawField string, displayName, unit, chartGroup, subGroup *string) error
	UpdateRename(ctx context.Context, deviceID, rawField string, displayName, unit, chartGroup, subGroup *string) error
	DeleteRename(ctx context.Context, deviceID, rawField string) error
	UpdateGroupConfig(ctx context.Context, deviceID, chartGroup string, description *string, sortOrder *int) error
	UpdateSubGroupConfig(ctx context.Context, deviceID, chartGroup, subGroup string, description *string, sortOrder *int) error
}

// UpdateDeviceRequest represents an update device request.
type UpdateDeviceRequest struct {
	Name       string `json:"name"`
	DeviceType string `json:"device_type"`
}

// DeviceHandler handles device-related endpoints.
type DeviceHandler struct {
	store DeviceStore
}

// NewDeviceHandler creates a new device handler.
func NewDeviceHandler(store DeviceStore) *DeviceHandler {
	return &DeviceHandler{store: store}
}

// ListDevices     List all devices
// @Summary      List devices
// @Description  Returns all known MQTT devices with field counts, ordered by last seen descending.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} []handlers.DeviceRow
// @Failure      401 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices [get]
func (h *DeviceHandler) ListDevices(c echo.Context) error {
	devices, err := h.store.GetDevices(c.Request().Context())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch devices"})
	}
	if devices == nil {
		devices = []DeviceRow{}
	}
	return c.JSON(http.StatusOK, devices)
}

// GetDevice       Get device by ID
// @Summary      Get device
// @Description  Returns a single device by its ID.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Device ID"
// @Success      200 {object} handlers.DeviceRow
// @Failure      401 {object} auth.ErrorResponse
// @Failure      404 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id} [get]
func (h *DeviceHandler) GetDevice(c echo.Context) error {
	deviceID := c.Param("id")
	devices, err := h.store.GetDevices(c.Request().Context())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch device"})
	}

	for _, d := range devices {
		if d.ID == deviceID {
			return c.JSON(http.StatusOK, d)
		}
	}
	return c.JSON(http.StatusNotFound, map[string]string{"error": "Device not found"})
}

// GetDeviceFields Get device field names
// @Summary      Get device fields
// @Description  Returns all distinct sensor field names for a device.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Device ID"
// @Success      200 {object} []string
// @Failure      401 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/fields [get]
func (h *DeviceHandler) GetDeviceFields(c echo.Context) error {
	deviceID := c.Param("id")
	fields, err := h.store.GetDeviceFields(c.Request().Context(), deviceID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch fields"})
	}
	if fields == nil {
		fields = []string{}
	}
	return c.JSON(http.StatusOK, fields)
}

// UpdateDevice    Update device (admin only)
// @Summary      Update device
// @Description  Updates a device's display name and type. Requires admin role.
// @Tags         devices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Device ID"
// @Param        request body handlers.UpdateDeviceRequest true "Device update data"
// @Success      200 {object} auth.MessageResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id} [put]
func (h *DeviceHandler) UpdateDevice(c echo.Context) error {
	deviceID := c.Param("id")
	var req struct {
		Name       string `json:"name"`
		DeviceType string `json:"device_type"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}

	if err := h.store.UpdateDevice(c.Request().Context(), deviceID, req.Name, req.DeviceType); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to update device"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "Device updated"})
}

// DeleteDevice    Delete device (admin only)
// @Summary      Delete device
// @Description  Deletes a device and all its associated readings and renames. Requires admin role.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Device ID"
// @Success      200 {object} auth.MessageResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id} [delete]
func (h *DeviceHandler) DeleteDevice(c echo.Context) error {
	deviceID := c.Param("id")
	if err := h.store.DeleteDevice(c.Request().Context(), deviceID); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to delete device"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "Device deleted"})
}

// DeleteDeviceField  Delete specific sensor field from device (admin only)
// @Summary      Delete device field
// @Description  Deletes all readings and label config for a specific field on a device. Requires admin role.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Device ID"
// @Param        field path string true "Field Name"
// @Success      200 {object} auth.MessageResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/fields/{field} [delete]
func (h *DeviceHandler) DeleteDeviceField(c echo.Context) error {
	deviceID := c.Param("id")
	fieldName := c.Param("field")
	if err := h.store.DeleteDeviceField(c.Request().Context(), deviceID, fieldName); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to delete field data"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "Field data deleted"})
}
