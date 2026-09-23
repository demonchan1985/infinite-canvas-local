import { Link2Off } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { RUNNING_HUB_WORKFLOW_PORT_X, runningHubWorkflowContentScale, runningHubWorkflowPortLabel, runningHubWorkflowPortY } from "@/components/canvas/canvas-runninghub-workflow-ports";
import { useThemeStore } from "@/stores/use-theme-store";
import type { RunningHubResource } from "@/stores/use-config-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export function ConnectionPath({
    connection,
    from,
    to,
    active,
    flowing,
    workflowPortsOpen = false,
    workflowResource,
    scale,
    onSelect,
    onDisconnect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    flowing: boolean;
    workflowPortsOpen?: boolean;
    workflowResource?: RunningHubResource;
    scale: number;
    onSelect: () => void;
    onDisconnect?: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const workflowScale = workflowResource ? runningHubWorkflowContentScale(to) : 1;
    const workflowPortY = runningHubWorkflowPortY(connection.toPort, workflowPortsOpen || Boolean(to.metadata?.runningHubWorkflowPortsOpen), workflowResource);
    const endX = workflowPortY === undefined ? to.position.x : to.position.x + RUNNING_HUB_WORKFLOW_PORT_X * workflowScale;
    const endY = connection.toPort
        ? to.position.y + (workflowPortY === undefined ? to.height / 2 : workflowPortY * workflowScale)
        : to.position.y + to.height / 2;
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
    const visualScale = Math.max(scale, 0.1);
    const baseStrokeWidth = (active ? 1.8 : 1.35) / visualScale;
    const flowDash = `${3 / visualScale} ${44 / visualScale}`;
    const flowDistance = -47 / visualScale;
    const midpointX = (startX + endX) / 2;
    const midpointY = (startY + endY) / 2;
    const portLabel = runningHubWorkflowPortLabel(connection.toPort);
    const portLabelWidth = portLabel ? Math.max(64, 28 + portLabel.length * 13) : 0;
    const showHoverControls = () => {
        if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
        hoverHideTimerRef.current = undefined;
        setHovered(true);
    };
    const hideHoverControls = () => {
        if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
        hoverHideTimerRef.current = setTimeout(() => {
            setHovered(false);
            hoverHideTimerRef.current = undefined;
        }, 120);
    };

    useEffect(() => () => {
        if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
    }, []);

    return (
        <g onPointerEnter={showHoverControls} onPointerLeave={hideHoverControls}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth={28 / visualScale}
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.node.activeStroke : theme.node.muted}
                strokeWidth={baseStrokeWidth}
                strokeOpacity={active ? 0.96 : 0.72}
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 4px ${theme.node.activeStroke}99)` : undefined, pointerEvents: "none" }}
            />
            {flowing ? <path
                d={pathD}
                stroke={theme.node.activeStroke}
                strokeWidth={1 / visualScale}
                strokeDasharray={flowDash}
                strokeLinecap="round"
                strokeOpacity={0.95}
                fill="none"
                style={{ filter: `drop-shadow(0 0 5px ${theme.node.activeStroke})`, pointerEvents: "none" }}
            >
                <animate attributeName="stroke-dashoffset" from="0" to={String(flowDistance)} dur="0.8s" repeatCount="indefinite" />
            </path> : null}
            {active ? <path d={pathD} stroke={theme.node.activeStroke} strokeWidth={3 / visualScale} strokeOpacity={0.08} fill="none" style={{ filter: `drop-shadow(0 0 5px ${theme.node.activeStroke})`, pointerEvents: "none" }} /> : null}
            {hovered && portLabel ? <g transform={`translate(${midpointX} ${midpointY - 26 / visualScale}) scale(${1 / visualScale})`} style={{ pointerEvents: "none" }} aria-label={`当前 RH 槽位：${portLabel}`}>
                <rect x={-portLabelWidth / 2} y="-11" width={portLabelWidth} height="22" rx="5" fill={theme.toolbar.panel} stroke={theme.node.activeStroke} strokeWidth="1" />
                <text x="0" y="4" fill={theme.node.text} fontSize="12" fontWeight="600" textAnchor="middle">{portLabel}</text>
            </g> : null}
            {hovered && onDisconnect ? (
                <g
                    role="button"
                    aria-label="断开连接"
                    tabIndex={0}
                    transform={`translate(${midpointX} ${midpointY}) scale(${1 / visualScale})`}
                    style={{ cursor: "pointer", pointerEvents: "all" }}
                    onPointerEnter={showHoverControls}
                    onPointerLeave={hideHoverControls}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        onDisconnect?.();
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onDisconnect?.();
                    }}
                >
                    <title>断开连接</title>
                    <circle r="11" fill={theme.toolbar.panel} stroke={theme.node.activeStroke} strokeWidth="1.5" />
                    <Link2Off x="-6" y="-6" width="12" height="12" strokeWidth="2.2" color={theme.node.activeStroke} />
                </g>
            ) : null}
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target, targetPortId, sourceWorkflowPortsOpen = false, sourceWorkflowResource, targetWorkflowPortsOpen = false, targetWorkflowResource, scale }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData; targetPortId?: string; sourceWorkflowPortsOpen?: boolean; sourceWorkflowResource?: RunningHubResource; targetWorkflowPortsOpen?: boolean; targetWorkflowResource?: RunningHubResource; scale: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const sourceWorkflowScale = sourceWorkflowResource ? runningHubWorkflowContentScale(node) : 1;
    const targetWorkflowScale = target && targetWorkflowResource ? runningHubWorkflowContentScale(target) : 1;
    const workflowPortY = runningHubWorkflowPortY(handle.portId, sourceWorkflowPortsOpen, sourceWorkflowResource);
    const targetWorkflowPortY = runningHubWorkflowPortY(targetPortId, targetWorkflowPortsOpen, targetWorkflowResource);
    const inputY = workflowPortY === undefined ? node.position.y + node.height / 2 : node.position.y + workflowPortY * sourceWorkflowScale;
    const inputX = workflowPortY === undefined ? node.position.x : node.position.x + RUNNING_HUB_WORKFLOW_PORT_X * sourceWorkflowScale;
    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : inputX;
    const endY = handle.handleType === "source" ? mouseWorld.y : inputY;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x + (targetWorkflowPortY === undefined ? 0 : RUNNING_HUB_WORKFLOW_PORT_X * targetWorkflowScale) : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + (targetWorkflowPortY === undefined ? target.height / 2 : targetWorkflowPortY * targetWorkflowScale) : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;
    const visualScale = Math.max(scale, 0.1);

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth={1.8 / visualScale} fill="none" strokeDasharray={`${12 / visualScale} ${8 / visualScale}`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${theme.node.activeStroke})` }} />;
}
